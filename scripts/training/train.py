#!/usr/bin/env python3
"""Train a climbing-fine-tuned YOLO-Pose model.

Implements the curriculum from docs/yolo-pose-migration-spec.md §6.5:

    Phase A: epochs 1–60   — full data, standard aug.
    Phase B: epochs 61–140 — oversample overhang + hard moves 3x.
    Phase C: epochs 141–200 — fine-tune at imgsz=768, flip OFF, small lr.

Calls dataset_sanity.py first and refuses to train on bad data.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

try:
    from ultralytics import YOLO  # type: ignore[import-not-found]
except ImportError as exc:  # pragma: no cover
    print(
        f"train: required dependency missing ({exc}). "
        "Install via `pip install -r requirements.txt`.",
        file=sys.stderr,
    )
    raise SystemExit(2)


HERE = Path(__file__).parent


def run_sanity(root: Path, strict: bool) -> None:
    cmd = [sys.executable, str(HERE / "dataset_sanity.py"), "--root", str(root)]
    if strict:
        cmd.append("--strict")
    res = subprocess.run(cmd)
    if res.returncode != 0:
        print("train: dataset_sanity failed — refusing to train on bad data.", file=sys.stderr)
        raise SystemExit(res.returncode)


def phase_a(model: YOLO, config: Path, epochs: int, imgsz: int, project: str, run_name: str) -> Path:
    """Warmstart from COCO-Pose, full-data baseline."""
    results = model.train(
        data=str(config),
        epochs=epochs,
        imgsz=imgsz,
        batch=-1,  # auto
        optimizer="AdamW",
        lr0=0.001,
        lrf=0.01,
        weight_decay=0.0005,
        warmup_epochs=3,
        patience=30,
        box=7.5,
        pose=12.0,
        kobj=2.0,
        fliplr=0.5,
        mosaic=1.0,
        project=project,
        name=f"{run_name}-A",
    )
    return Path(results.save_dir) / "weights" / "best.pt"


def phase_b(weights: Path, config: Path, epochs: int, imgsz: int, project: str, run_name: str) -> Path:
    """Oversample hard moves — caller is expected to have rebuilt
    splits/train.txt with 3x duplication for overhang/hard-move frames
    before this phase is invoked."""
    model = YOLO(str(weights))
    results = model.train(
        data=str(config),
        epochs=epochs,
        imgsz=imgsz,
        batch=-1,
        optimizer="AdamW",
        lr0=0.0005,
        lrf=0.01,
        weight_decay=0.0005,
        patience=30,
        box=7.5,
        pose=14.0,  # lean harder on pose loss for the rare moves
        kobj=2.0,
        fliplr=0.5,
        mosaic=1.0,
        project=project,
        name=f"{run_name}-B",
    )
    return Path(results.save_dir) / "weights" / "best.pt"


def phase_c(weights: Path, config: Path, epochs: int, project: str, run_name: str) -> Path:
    """High-res fine-tune with flip OFF — left/right labels matter for
    flagging / hip_positioning scoring."""
    model = YOLO(str(weights))
    results = model.train(
        data=str(config),
        epochs=epochs,
        imgsz=768,
        batch=-1,
        optimizer="AdamW",
        lr0=0.0001,
        lrf=0.05,
        weight_decay=0.0005,
        patience=20,
        box=7.5,
        pose=14.0,
        kobj=2.0,
        fliplr=0.0,  # disable in final phase
        mosaic=0.0,  # disable mosaic too — simulate deployment
        project=project,
        name=f"{run_name}-C",
    )
    return Path(results.save_dir) / "weights" / "best.pt"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--config", type=Path, default=HERE / "climbing_pose.yaml")
    ap.add_argument("--model", default="yolo11n-pose.pt", help="warmstart checkpoint")
    ap.add_argument("--data-root", type=Path, default=Path("data"))
    ap.add_argument("--project", default="runs/pose")
    ap.add_argument("--run-name", default=None)
    ap.add_argument("--phase-a-epochs", type=int, default=60)
    ap.add_argument("--phase-b-epochs", type=int, default=80)
    ap.add_argument("--phase-c-epochs", type=int, default=60)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--strict-sanity", action="store_true")
    ap.add_argument("--skip-sanity", action="store_true", help="dev only; never in CI")
    ap.add_argument(
        "--phases",
        default="abc",
        help="which phases to run, e.g. 'a', 'ab', 'abc'",
    )
    args = ap.parse_args()

    if not args.skip_sanity:
        run_sanity(args.data_root, args.strict_sanity)

    run_name = args.run_name or f"climber-yolo-{int(time.time())}"
    print(f"train: starting run {run_name}")

    manifest = {
        "runName": run_name,
        "warmstart": args.model,
        "config": str(args.config),
        "phases": args.phases,
        "imgsz": args.imgsz,
    }

    best: Path
    model = YOLO(args.model)

    if "a" in args.phases:
        best = phase_a(model, args.config, args.phase_a_epochs, args.imgsz, args.project, run_name)
        manifest["phaseA"] = str(best)

    if "b" in args.phases:
        if "a" not in args.phases:
            best = Path(args.model)
        best = phase_b(best, args.config, args.phase_b_epochs, args.imgsz, args.project, run_name)
        manifest["phaseB"] = str(best)

    if "c" in args.phases:
        if "a" not in args.phases and "b" not in args.phases:
            best = Path(args.model)
        best = phase_c(best, args.config, args.phase_c_epochs, args.project, run_name)
        manifest["phaseC"] = str(best)

    manifest_path = Path(args.project) / f"{run_name}.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"train: done. run manifest at {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
