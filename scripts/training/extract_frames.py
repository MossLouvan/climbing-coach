#!/usr/bin/env python3
"""Sample frames from a source video at a target fps.

Used for the self-labeled leg of the dataset — feed CC-licensed
climbing videos in, get stratified frames out. Emits one JPEG per
sampled frame plus a sidecar `_meta.json` noting the source video,
fps, and timestamp per frame so labelers can cite the original.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import cv2  # type: ignore[import-not-found]
except ImportError as exc:  # pragma: no cover
    print(
        f"extract_frames: required dependency missing ({exc}). "
        "Install via `pip install -r requirements.txt`.",
        file=sys.stderr,
    )
    raise SystemExit(2)


def extract(source: Path, out_dir: Path, target_fps: float, jpeg_quality: int) -> int:
    if not source.is_file():
        raise FileNotFoundError(source)
    cap = cv2.VideoCapture(str(source))
    if not cap.isOpened():
        raise RuntimeError(f"cv2 could not open {source}")

    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    stride = max(1, round(src_fps / target_fps))

    out_dir.mkdir(parents=True, exist_ok=True)
    meta = {
        "source": str(source),
        "sourceFps": src_fps,
        "targetFps": target_fps,
        "stride": stride,
        "totalSourceFrames": total,
        "samples": [],
    }

    written = 0
    frame_idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if frame_idx % stride == 0:
            out_path = out_dir / f"frame_{written:06d}.jpg"
            cv2.imwrite(
                str(out_path),
                frame,
                [int(cv2.IMWRITE_JPEG_QUALITY), jpeg_quality],
            )
            meta["samples"].append(
                {
                    "file": out_path.name,
                    "sourceFrame": frame_idx,
                    "timestampMs": int(1000 * frame_idx / src_fps),
                }
            )
            written += 1
        frame_idx += 1

    cap.release()
    (out_dir / "_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return written


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--fps", type=float, default=5.0, help="target sampling fps")
    ap.add_argument("--quality", type=int, default=92, help="JPEG quality 1-100")
    args = ap.parse_args()

    written = extract(args.source, args.out, args.fps, args.quality)
    print(f"extract_frames: wrote {written} frames to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
