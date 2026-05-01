#!/usr/bin/env python3
"""Export a trained YOLO-Pose .pt to TFLite for Android bundling.

Produces int8 or fp16 TFLite depending on flags. The Android native
bridge loads this via the NNAPI delegate where supported. Evaluate the
exported model directly — see spec §7.
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
        f"export_tflite: required dependency missing ({exc}). "
        "Install via `pip install -r requirements.txt`.",
        file=sys.stderr,
    )
    raise SystemExit(2)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--weights", required=True, type=Path)
    ap.add_argument("--out", type=Path, default=Path("modules/climbing-pose/android/weights"))
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument(
        "--quant",
        choices=["fp32", "fp16", "int8"],
        default="fp16",
        help="target quantization",
    )
    ap.add_argument("--tag", default=None)
    args = ap.parse_args()

    if not args.weights.is_file():
        print(f"export_tflite: {args.weights} not found", file=sys.stderr)
        return 1

    model = YOLO(str(args.weights))
    exported = model.export(
        format="tflite",
        imgsz=args.imgsz,
        half=args.quant == "fp16",
        int8=args.quant == "int8",
    )
    exported_path = Path(exported)
    args.out.mkdir(parents=True, exist_ok=True)
    tag = args.tag or args.weights.stem
    dest = args.out / f"{tag}.tflite"
    if dest.exists():
        dest.unlink()
    shutil.move(str(exported_path), str(dest))
    print(f"export_tflite: wrote {dest}")
    print("next: bump MODEL_TAG in modules/climbing-pose/android/ClimbingPoseModule.kt, rebuild app.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
