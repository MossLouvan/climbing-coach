#!/usr/bin/env python3
"""Export a trained YOLO-Pose .pt to CoreML .mlpackage for iOS bundling.

IMPORTANT: Evaluate the exported model directly, not just the .pt.
Post-quantization accuracy drift is a common source of "training was
great, shipping was bad" regressions. See spec §7.
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

try:
    from ultralytics import YOLO  # type: ignore[import-not-found]
except ImportError as exc:  # pragma: no cover
    print(
        f"export_coreml: required dependency missing ({exc}). "
        "Install via `pip install -r requirements.txt`.",
        file=sys.stderr,
    )
    raise SystemExit(2)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--weights", required=True, type=Path)
    ap.add_argument("--out", type=Path, default=Path("modules/climbing-pose/ios/weights"))
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--half", action="store_true", help="FP16 quantization")
    ap.add_argument("--nms", action="store_true", default=True)
    ap.add_argument("--tag", default=None, help="override weights tag (defaults to stem of --weights)")
    args = ap.parse_args()

    if not args.weights.is_file():
        print(f"export_coreml: {args.weights} not found", file=sys.stderr)
        return 1

    model = YOLO(str(args.weights))
    exported = model.export(
        format="coreml",
        imgsz=args.imgsz,
        half=args.half,
        nms=args.nms,
    )
    # ultralytics returns the exported file path
    exported_path = Path(exported)
    args.out.mkdir(parents=True, exist_ok=True)
    tag = args.tag or args.weights.stem
    dest = args.out / f"{tag}.mlpackage"
    if dest.exists():
        if dest.is_dir():
            shutil.rmtree(dest)
        else:
            dest.unlink()
    shutil.move(str(exported_path), str(dest))
    print(f"export_coreml: wrote {dest}")
    print("next: bump MODEL_TAG in modules/climbing-pose/ios/ClimbingPoseModule.swift, rebuild app.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
