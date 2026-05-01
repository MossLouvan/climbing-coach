# Export pretrained YOLO-Pose weights for on-device inference

Convert a pretrained Ultralytics YOLO-Pose `.pt` checkpoint into the
mobile formats the native bridge loads:

- iOS → CoreML `.mlpackage`
- Android → TFLite `.tflite`

**No training happens here.** The shipping model is a stock
pretrained YOLO-Pose checkpoint (currently
`models/pretrained/yolo26n-pose.pt`); these scripts are pure
format-conversion utilities. The runtime contract (17-COCO keypoints,
single climber per frame) is unchanged from
`src/analysis/pose/PoseProvider.ts`.

## Setup

```bash
cd scripts/export
python3.11 -m venv .venv          # 3.11 matches torch 2.4.1 wheels
source .venv/bin/activate
pip install -r requirements.txt
```

## iOS — CoreML

```bash
python export_coreml.py \
  --weights ../../models/pretrained/yolo26n-pose.pt \
  --imgsz 640 \
  --half                          # FP16 quantization
```

Output: `modules/climbing-pose/ios/weights/yolo26n-pose.mlpackage`.
Then bump `MODEL_TAG` in
`modules/climbing-pose/ios/ClimbingPoseModule.swift` and rebuild.

## Android — TFLite

```bash
python export_tflite.py \
  --weights ../../models/pretrained/yolo26n-pose.pt \
  --imgsz 640 \
  --quant fp16                    # or int8 for smaller / faster
```

Output: `modules/climbing-pose/android/weights/yolo26n-pose.tflite`.
Then bump `MODEL_TAG` in
`modules/climbing-pose/android/ClimbingPoseModule.kt` and rebuild.

## After conversion — verify on device

Quantization can drift accuracy from the source `.pt`. Always
benchmark the **exported artifact** (not the `.pt`) end-to-end:

1. Build the app against the new weights.
2. Run a session through `analyzeSession()`; confirm `poseTrack.source === 'yolo'`.
3. Eyeball the rendered skeleton over the same clip you used to
   benchmark `VisionPoseProvider`. If the new path is materially
   worse, fall back via `EXPO_PUBLIC_ANALYSIS_POSE_BACKEND=vision`
   and investigate quantization (try `--quant fp32` or skip `--half`).
