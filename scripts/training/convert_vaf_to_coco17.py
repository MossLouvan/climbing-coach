#!/usr/bin/env python3
"""Convert a Roboflow VAF "Bouldering Poses" export to YOLO-Pose
labels with the 17-COCO keypoint order used by this project.

The Roboflow export is **native-KP**: its per-keypoint order is
defined by the Roboflow project, not by COCO. The scout flagged
(source_review.md §2) that the mapping MUST be verified from the
Roboflow project page before training — this script refuses to
silently guess. The human verifier provides an explicit mapping via
``--mapping path/to/vaf_to_coco17.json``.

Mapping file format::

    {
      "vaf_keypoint_order": [
        "nose", "left_eye", ..., "right_ankle"
      ],
      "vaf_to_coco17": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
    }

``vaf_keypoint_order`` is the order emitted by the Roboflow export
(inspect a sample JSON before filling this in). ``vaf_to_coco17`` is
a length-17 permutation where position *i* tells us which index in
the VAF export corresponds to COCO keypoint *i* (order defined by
``src/domain/models/pose.ts::JOINT_NAMES``).

This script intentionally does NOT:
  * download the VAF export (the human runs the Roboflow CLI),
  * fix missing / low-confidence keypoints (those remain v=0),
  * write outside the ``labels/test/`` slice (VAF is a test-only
    sanity set per docs/yolo_pose_dataset_conversion.md).

It reads the Roboflow YOLOv8-Pose export layout::

    <export>/test/images/<stem>.jpg
    <export>/test/labels/<stem>.txt   # class cx cy w h k0x k0y v0 ...

and writes 17-COCO-ordered labels to::

    datasets/climbing-pose/labels/test/<stem>.txt

copying the corresponding images to ``datasets/climbing-pose/images/test/``.

Exit code 0 → conversion succeeded, all files are 56-field YOLO-Pose.
Exit code 1 → input malformed; nothing silently fixed.
Exit code 2 → missing mapping file or bad CLI args.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

COCO17_NAMES = [
    "nose",
    "left_eye",
    "right_eye",
    "left_ear",
    "right_ear",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
]
EXPECTED_FIELDS_PER_INSTANCE = 1 + 4 + 17 * 3  # 56


def load_mapping(path: Path) -> list[int]:
    with path.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    mapping = data.get("vaf_to_coco17")
    order = data.get("vaf_keypoint_order")
    if not isinstance(mapping, list) or len(mapping) != 17:
        raise ValueError(
            "mapping file must contain 'vaf_to_coco17' as a length-17 list"
        )
    if not isinstance(order, list) or len(order) == 0:
        raise ValueError(
            "mapping file must contain 'vaf_keypoint_order' describing the "
            "source (VAF) keypoint order; this is how the human verifier "
            "documents what they read from the Roboflow project page."
        )
    for i, idx in enumerate(mapping):
        if not isinstance(idx, int) or idx < 0 or idx >= len(order):
            raise ValueError(
                f"vaf_to_coco17[{i}] = {idx!r} is out of range for a "
                f"vaf_keypoint_order of length {len(order)}"
            )
    if sorted(mapping) != list(range(len(order)))[: 17] and len(order) != 17:
        # When the VAF export has != 17 keypoints, the mapping is not a
        # plain permutation; allow it but flag once so a human sees it.
        print(
            f"convert_vaf_to_coco17: note — VAF export has {len(order)} "
            f"keypoints, mapping is a projection not a permutation",
            file=sys.stderr,
        )
    return mapping


def remap_line(
    raw: str,
    mapping: list[int],
    src_kp_count: int,
    src_path: Path,
    line_no: int,
) -> str:
    parts = raw.strip().split()
    if not parts:
        return ""
    expected_src = 1 + 4 + src_kp_count * 3
    if len(parts) != expected_src:
        raise ValueError(
            f"{src_path}:{line_no}: expected {expected_src} fields for "
            f"{src_kp_count} source keypoints, got {len(parts)}"
        )
    class_id = parts[0]
    bbox = parts[1:5]
    src_kps = parts[5:]
    # Group src keypoints into (x, y, v) triples.
    triples = [
        src_kps[3 * i : 3 * i + 3] for i in range(src_kp_count)
    ]
    # Re-order into COCO-17 layout.
    dst = [class_id, *bbox]
    for coco_idx, src_idx in enumerate(mapping):
        dst.extend(triples[src_idx])
    if len(dst) != EXPECTED_FIELDS_PER_INSTANCE:
        raise ValueError(
            f"{src_path}:{line_no}: remapped instance has {len(dst)} "
            f"fields, expected {EXPECTED_FIELDS_PER_INSTANCE}. The "
            f"mapping file is wrong; fix it rather than padding here."
        )
    return " ".join(dst)


def convert(
    export_root: Path,
    dataset_root: Path,
    mapping_path: Path,
    split: str,
) -> int:
    with mapping_path.open("r", encoding="utf-8") as fh:
        map_data = json.load(fh)
    src_kp_count = len(map_data["vaf_keypoint_order"])
    mapping = load_mapping(mapping_path)

    src_images = export_root / split / "images"
    src_labels = export_root / split / "labels"
    if not src_images.is_dir() or not src_labels.is_dir():
        print(
            f"convert_vaf_to_coco17: expected {src_images} and {src_labels} "
            f"to exist (Roboflow YOLOv8-Pose export layout)",
            file=sys.stderr,
        )
        return 1

    dst_images = dataset_root / "images" / "test"
    dst_labels = dataset_root / "labels" / "test"
    dst_images.mkdir(parents=True, exist_ok=True)
    dst_labels.mkdir(parents=True, exist_ok=True)

    converted = 0
    for label_path in sorted(src_labels.glob("*.txt")):
        img_candidates = [
            src_images / f"{label_path.stem}{ext}"
            for ext in (".jpg", ".jpeg", ".png")
        ]
        img_src = next((p for p in img_candidates if p.is_file()), None)
        if img_src is None:
            print(
                f"convert_vaf_to_coco17: no image for {label_path.name}; "
                f"skipping (not silently fabricating).",
                file=sys.stderr,
            )
            continue

        out_lines: list[str] = []
        try:
            for line_no, raw in enumerate(
                label_path.read_text(encoding="utf-8").splitlines(), start=1
            ):
                remapped = remap_line(
                    raw, mapping, src_kp_count, label_path, line_no
                )
                if remapped:
                    out_lines.append(remapped)
        except ValueError as exc:
            print(f"convert_vaf_to_coco17: {exc}", file=sys.stderr)
            return 1

        (dst_labels / label_path.name).write_text(
            "\n".join(out_lines) + ("\n" if out_lines else ""),
            encoding="utf-8",
        )
        shutil.copy2(img_src, dst_images / img_src.name)
        converted += 1

    print(
        f"convert_vaf_to_coco17: converted {converted} frames "
        f"({len(COCO17_NAMES)}-COCO keypoint order) to {dst_labels}"
    )
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--export-root",
        required=True,
        type=Path,
        help="Roboflow YOLOv8-Pose export root (contains test/images "
        "and test/labels).",
    )
    ap.add_argument(
        "--dataset-root",
        default=Path("datasets/climbing-pose"),
        type=Path,
        help="Target dataset root (default: datasets/climbing-pose).",
    )
    ap.add_argument(
        "--mapping",
        required=True,
        type=Path,
        help="Path to vaf_to_coco17 mapping JSON. See module docstring.",
    )
    ap.add_argument(
        "--split",
        default="test",
        choices=["train", "valid", "val", "test"],
        help="Roboflow export split to consume. VAF is eval-only, so "
        "'test' is the right default.",
    )
    args = ap.parse_args()
    try:
        return convert(
            args.export_root, args.dataset_root, args.mapping, args.split
        )
    except (FileNotFoundError, ValueError) as exc:
        print(f"convert_vaf_to_coco17: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
