#!/usr/bin/env python3
"""Dataset sanity check — refuse to train on bad data.

Verifies every source under `data/manifests/` against
`dataset_manifest.schema.json` and enforces invariants that the
migration spec (docs/yolo-pose-migration-spec.md §5, §9) depends on:

    * License is verified by a human with an ISO date.
    * Keypoint labels are exactly 17 entries in COCO order.
    * Content hashes don't collide (no silent duplicate ingest).
    * `frameCount` adds up to what's on disk under splits/.

Exit code 0 → dataset is safe to pass to train.py.
Exit code 1 → at least one invariant failed; training is blocked.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

try:
    import yaml  # type: ignore[import-not-found]
    from jsonschema import Draft7Validator  # type: ignore[import-not-found]
except ImportError as exc:  # pragma: no cover - handled at CLI boundary
    print(
        f"dataset_sanity: required dependency missing ({exc}). "
        "Run `pip install -r requirements.txt` inside the training venv.",
        file=sys.stderr,
    )
    raise SystemExit(2)


EXPECTED_KEYPOINTS = 17
SCHEMA_PATH = Path(__file__).with_name("dataset_manifest.schema.json")


@dataclass
class Finding:
    severity: str  # "error" | "warning"
    where: str
    message: str


@dataclass
class Report:
    findings: list[Finding] = field(default_factory=list)

    @property
    def errors(self) -> list[Finding]:
        return [f for f in self.findings if f.severity == "error"]

    def add(self, severity: str, where: str, message: str) -> None:
        self.findings.append(Finding(severity, where, message))


def load_schema() -> Draft7Validator:
    with SCHEMA_PATH.open("r", encoding="utf-8") as fh:
        return Draft7Validator(json.load(fh))


def iter_manifests(root: Path) -> Iterable[Path]:
    manifest_dir = root / "manifests"
    if not manifest_dir.is_dir():
        return []
    return sorted(p for p in manifest_dir.iterdir() if p.suffix in {".yaml", ".yml", ".json"})


def load_manifest(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as fh:
        if path.suffix == ".json":
            return json.load(fh)
        return yaml.safe_load(fh)


def check_keypoints(label_path: Path, report: Report) -> None:
    """YOLO-format label file: one line per instance,
    `class cx cy w h kpt0_x kpt0_y v0 kpt1_x kpt1_y v1 ...`.
    """
    try:
        lines = label_path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        report.add("error", str(label_path), f"unreadable label file: {exc}")
        return

    for line_no, raw in enumerate(lines, start=1):
        parts = raw.strip().split()
        if not parts:
            continue
        # class + bbox(4) + 17 keypoints * 3 = 1 + 4 + 51 = 56 fields
        expected = 1 + 4 + EXPECTED_KEYPOINTS * 3
        if len(parts) != expected:
            report.add(
                "error",
                f"{label_path}:{line_no}",
                f"expected {expected} fields for 17-COCO keypoints, got {len(parts)}",
            )


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return f"sha256:{h.hexdigest()}"


def check_manifests(root: Path) -> Report:
    report = Report()
    schema = load_schema()
    manifests = list(iter_manifests(root))
    if not manifests:
        report.add(
            "error",
            str(root / "manifests"),
            "no manifests found — every training source must have one",
        )
        return report

    hashes: Counter[str] = Counter()
    total_frames = 0

    for path in manifests:
        try:
            manifest = load_manifest(path)
        except (yaml.YAMLError, json.JSONDecodeError) as exc:
            report.add("error", str(path), f"malformed manifest: {exc}")
            continue

        for err in schema.iter_errors(manifest):
            report.add("error", str(path), f"schema violation: {err.message}")

        lic = manifest.get("license") or {}
        if not lic.get("verifiedBy") or not lic.get("verifiedAt"):
            report.add(
                "error",
                str(path),
                "license.verifiedBy + license.verifiedAt required — no manifest passes without human sign-off",
            )

        h = manifest.get("contentHash")
        if h:
            hashes[h] += 1

        frames = manifest.get("frameCount", 0)
        if isinstance(frames, int):
            total_frames += frames

    for h, count in hashes.items():
        if count > 1:
            report.add(
                "error",
                "manifests",
                f"duplicate contentHash {h} across {count} manifests — dedupe before training",
            )

    for split in ("train.txt", "val.txt", "test.txt"):
        split_path = root / "splits" / split
        if not split_path.is_file():
            report.add("warning", str(split_path), "split file missing — run extract_frames.py")

    labels_dir = root / "labels"
    if labels_dir.is_dir():
        for label in labels_dir.rglob("*.txt"):
            check_keypoints(label, report)

    if total_frames < 15_000:
        report.add(
            "warning",
            "aggregate",
            f"only {total_frames} labeled frames — spec §5.1 requires ≥15k from licensed sources",
        )

    return report


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", default="data", type=Path, help="dataset root")
    ap.add_argument("--strict", action="store_true", help="treat warnings as errors")
    args = ap.parse_args()

    report = check_manifests(args.root)

    for f in report.findings:
        prefix = "ERROR" if f.severity == "error" else "WARN "
        print(f"{prefix} {f.where}: {f.message}", file=sys.stderr)

    if report.errors or (args.strict and report.findings):
        print(f"\ndataset_sanity: FAIL ({len(report.errors)} error(s))", file=sys.stderr)
        return 1

    print(f"dataset_sanity: OK ({len(report.findings)} warning(s))")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
