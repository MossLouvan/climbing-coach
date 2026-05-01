# Pretrained YOLO-Pose weights

The pretrained Ultralytics YOLO-Pose checkpoint the app ships against.
The `.pt` file itself is **not** committed (matched by `*.pt` in
`.gitignore`); only this README documents its expected location.

## Current weights

- **File:** `yolo26n-pose.pt`
- **Architecture:** Ultralytics YOLO-Pose (nano variant)
- **Schema:** 17-keypoint COCO order (matches `JOINT_NAMES` in `src/domain/models/pose.ts`)
- **License:** AGPL-3.0 (Ultralytics) — see `docs/yolo-pose-migration-spec.md` §9 for the licensing implications of shipping derived weights in a closed-source app.

## Where it goes next

This `.pt` is a PyTorch checkpoint and cannot run on iOS / Android
directly. Convert it to mobile formats with the scripts under
`scripts/export/`:

```bash
# iOS CoreML
python scripts/export/export_coreml.py --weights models/pretrained/yolo26n-pose.pt --half

# Android TFLite
python scripts/export/export_tflite.py --weights models/pretrained/yolo26n-pose.pt --quant fp16
```

Outputs land under `modules/climbing-pose/<platform>/weights/` and
are loaded by the native bridge.

## Replacing the model

If you swap in a different YOLO-Pose checkpoint:
1. Drop the new `.pt` here.
2. Re-run the relevant export script.
3. Bump `MODEL_TAG` in the native module so the runtime can tell the
   versions apart.
4. Verify `kpt_shape: [17, 3]` and the standard COCO `flip_idx` —
   anything else breaks the existing scoring code, which assumes
   17-COCO order.
