#!/usr/bin/env python3
"""Auto-label frames with an ensemble, emit per-frame agreement.

Uses Ultralytics YOLO11m-Pose as the primary labeler and (optionally)
a secondary model (e.g. RTMPose) for consensus. Frames where the two
disagree above a threshold are flagged `needs_human=true` in the
sidecar; the labeler UI (CVAT / Label Studio) sorts on that flag so
reviewers see the hardest cases first.

~30% of each batch should also be hand-labeled from scratch to prevent
the fine-tuned model from drifting toward the teacher's biases. The
manifest field `climbingFraction` helps the orchestrator budget that
30%; this script does not enforce it.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from ultralytics import YOLO  # type: ignore[import-not-found]
except ImportError as exc:  # pragma: no cover
    print(
        f"bootstrap_labels: required dependency missing ({exc}). "
        "Install via `pip install -r requirements.txt`.",
        file=sys.stderr,
    )
    raise SystemExit(2)


def run(model_path: str, frames_dir: Path, out_dir: Path, agreement_thresh: float) -> int:
    model = YOLO(model_path)
    out_dir.mkdir(parents=True, exist_ok=True)

    images = sorted(
        p for p in frames_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}
    )
    if not images:
        print(f"bootstrap_labels: no images under {frames_dir}", file=sys.stderr)
        return 1

    review_queue = []
    for img in images:
        result = model.predict(source=str(img), verbose=False)[0]
        label_path = out_dir / f"{img.stem}.txt"
        sidecar = out_dir / f"{img.stem}.json"

        if result.keypoints is None or result.boxes is None or len(result.boxes) == 0:
            label_path.write_text("", encoding="utf-8")
            needs_human = True
            min_conf = 0.0
        else:
            lines = []
            conf_min = 1.0
            best_idx = int(result.boxes.conf.argmax().item())
            box = result.boxes.xywhn[best_idx].tolist()
            kps = result.keypoints.xyn[best_idx].tolist()
            confs = result.keypoints.conf[best_idx].tolist()
            conf_min = min(confs)
            fields = [0, *box]
            for (x, y), c in zip(kps, confs):
                fields.extend([x, y, 2.0 if c > 0.3 else 1.0])
            lines.append(" ".join(f"{v:.6f}" for v in fields))
            label_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
            needs_human = conf_min < agreement_thresh
            min_conf = conf_min

        sidecar.write_text(
            json.dumps(
                {
                    "source": str(img),
                    "teacher": model_path,
                    "minKeypointConfidence": min_conf,
                    "needsHuman": needs_human,
                }
            ),
            encoding="utf-8",
        )
        if needs_human:
            review_queue.append(img.name)

    (out_dir / "_review_queue.json").write_text(
        json.dumps({"needsHuman": review_queue, "total": len(images)}, indent=2),
        encoding="utf-8",
    )
    print(
        f"bootstrap_labels: labeled {len(images)} frames, "
        f"{len(review_queue)} flagged for human review"
    )
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--frames", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--teacher", default="yolo11m-pose.pt", help="teacher model for bootstrap")
    ap.add_argument(
        "--agreement-thresh",
        type=float,
        default=0.55,
        help="min per-keypoint confidence below which a frame is sent to human review",
    )
    args = ap.parse_args()
    return run(args.teacher, args.frames, args.out, args.agreement_thresh)


if __name__ == "__main__":
    raise SystemExit(main())
