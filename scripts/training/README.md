# YOLO-Pose training pipeline

Out-of-device training scaffolding for the climbing-fine-tuned
Ultralytics YOLO-Pose model. Full rationale lives in
[`docs/yolo-pose-migration-spec.md`](../../docs/yolo-pose-migration-spec.md).

**Nothing here ships in the app.** These scripts run on a training box
(single H100 or 2×A100 recommended) and produce the `.mlpackage` /
`.tflite` artifacts that the app bundles under
`modules/climbing-pose/<platform>/weights/`.

## Layout

```
scripts/training/
  README.md                   # you are here
  requirements.txt            # Python dependencies (pinned)
  climbing_pose.yaml          # Ultralytics dataset config
  dataset_manifest.schema.json
  extract_frames.py           # sample frames from source video
  bootstrap_labels.py         # auto-label with ensemble, emit confidence
  dataset_sanity.py           # license / keypoint-order / dedupe checks
  train.py                    # Ultralytics training entry point
  export_coreml.py            # PyTorch .pt → .mlpackage
  export_tflite.py            # PyTorch .pt → .tflite
```

## End-to-end flow (v1)

1. **Acquire data** (out of repo — license-tracked in
   `data/manifests/*.yaml`):
   - Public climbing datasets (COCO-Pose warmstart, MPII climbing
     subset, Penn Action, Roboflow Universe climbing projects,
     research sets with author permission).
   - Self-labeled CC-licensed climbing video.
2. **Extract frames** from raw video:
   ```bash
   python extract_frames.py --source data/raw/<video>.mp4 \
     --fps 5 --out data/frames/<clip-id>
   ```
3. **Bootstrap labels** with an ensemble (YOLO11m + Apple Vision) and
   human-correct under the agreement threshold:
   ```bash
   python bootstrap_labels.py --frames data/frames/<clip-id> \
     --out data/labels/<clip-id>
   ```
4. **Validate the dataset** — fails CI if any manifest is missing a
   license, if keypoint order drifts from COCO-17, or if duplicate
   frames sneak in:
   ```bash
   python dataset_sanity.py --root data
   ```
5. **Train**:
   ```bash
   python train.py --config climbing_pose.yaml --model yolo11n-pose.pt
   ```
   W&B project: `climbing-pose`. Best checkpoint is chosen on
   **val OKS weighted by move-type rarity**, not vanilla OKS.
6. **Export** to mobile formats and evaluate the exported model
   *directly* (quantization drift is real):
   ```bash
   python export_coreml.py  --weights runs/pose/train/weights/best.pt
   python export_tflite.py  --weights runs/pose/train/weights/best.pt
   ```
7. Drop the exported artifact in `modules/climbing-pose/ios/weights/`
   or `modules/climbing-pose/android/weights/`, bump the weights tag
   in the native bridge, and rebuild the app.
8. Fill in `docs/model_cards/yolo-pose-v1.md` with the run's metrics
   and open a PR.

## Acceptance gates

A model is only promotable when §7 of the migration spec is green.
`dataset_sanity.py` and `train.py` both refuse to proceed if
mandatory fields are missing from manifests.

## Reproducibility

- `requirements.txt` pins every dependency with `==`.
- Data lives under DVC (`data/` is gitignored except manifests).
- Each run records `{ dataset@revN, code@commitN, configHash }` into
  `runs/<run-id>/run.json`; the model card references this triple.
