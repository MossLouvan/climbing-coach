# YOLO-Pose Migration — Technical Spec

**Version:** 0.3 (pretrained-only)
**Status:** Provider scaffolding landed; awaiting weights conversion + native bundling.
**Owner:** Pose / Analysis
**Last updated:** 2026-04-30
**Related:** [`docs/spec.md`](./spec.md), [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md), `src/analysis/pose/`

**Rollout progress:**

- [x] Step 1 — `PoseSource: 'yolo'` + `YoloPoseProvider` + `EXPO_PUBLIC_ANALYSIS_POSE_BACKEND` flag.
- [x] Step 2 — Pretrained `.pt` lives under `models/pretrained/`; export scripts in `scripts/export/`.
- [ ] Step 3 — Convert `.pt` → CoreML; bundle under `modules/climbing-pose/ios/weights/`; wire iOS native bridge.
- [ ] Step 4 — Convert `.pt` → TFLite; bundle under `modules/climbing-pose/android/weights/`; wire Android native bridge.
- [ ] Step 5 — Staged default flip to `'yolo'` once on-device benchmarks pass §6.
- [ ] Step 6 — Remove `TFJSPoseProvider`; deprecate `VisionPoseProvider`.

---

## 1. Summary

Replace the current off-the-shelf 2D pose stack (Apple Vision
`VNDetectHumanBodyPoseRequest` on iOS, MoveNet-Lightning via TFJS
elsewhere) with a **pretrained Ultralytics YOLO-Pose** model. Ship
the new model through the existing `PoseProvider` boundary with no
changes to `domain/` or `analysis/` scoring code.

### 1.1 Why

- `TFJSPoseProvider` is a stub (`NEEDS_DEV_BUILD`); Android currently
  falls back to mock, making score quality off-iOS demo-only.
- A pretrained YOLO-Pose checkpoint runs on both platforms (CoreML on
  iOS, TFLite on Android) and unifies the runtime under one bridge.
- Apple Vision is a black box; even on iOS the YOLO path gives us a
  consistent model we control, can swap, and can benchmark.

### 1.2 Non-goals

- **Training a custom model.** This spec assumes a pretrained
  checkpoint is good enough. Climbing-specific fine-tuning is out of
  scope; if generic accuracy is unacceptable on hard moves (heel
  hooks, inverted hips), the fix is product-side — keep
  `VisionPoseProvider` as a fallback or revisit fine-tuning later as
  a separate spec.
- Changing the domain keypoint schema (stay 17-COCO; see `JOINT_NAMES`
  in `src/domain/models/pose.ts`).
- Replacing the pseudo-3D lifter, phase segmentation, or scoring
  engine.
- Cloud inference. All inference stays on-device.
- Removing `MockPoseProvider` — kept for Expo Go demos and tests.

### 1.3 Success metrics

| Metric | Baseline (Apple Vision on iOS) | Target (YOLO-Pose, on-device) |
| ------ | ------------------------------ | ----------------------------- |
| End-to-end analysis latency for a 15 s clip, iPhone 15 | ~4 s | **≤ 6 s** |
| Model size (on-device, FP16) | n/a (Vision is system) | **≤ 15 MB** |
| Scoring regression on 10 seeded sessions | — | All 8 category scores within **±5** of the Vision baseline |
| `liftConfidence` on validation sessions | — | **≥ 0.7** |
| Analysis crash rate | — | **< 0.5 %** |

These are gates a pretrained model can hit. Pose-quality metrics
(OKS, mAP@0.50:0.95, hard-moves slice, demographic gap) lived in v0.2
when we planned to train; with a pretrained-only model we evaluate by
**scoring regression** on real climbing clips — if scores drift more
than ±5 from the Vision baseline on the same clip, the new path is
not shippable and we either keep Vision on iOS or revisit
fine-tuning.

---

## 2. Current state

`src/analysis/pose/`:

- `PoseProvider.ts` — abstract boundary. **Keep.**
- `MockPoseProvider.ts` — seeded; used for Expo Go and tests. **Keep.**
- `VisionPoseProvider.ts` → `modules/climbing-pose` (iOS,
  `VNDetectHumanBodyPoseRequest`). **Keep as fallback for one
  release; remove in Step 6.**
- `TFJSPoseProvider.ts` — stub that throws `NEEDS_DEV_BUILD`. **Remove
  in Step 6.**
- `YoloPoseProvider.ts` — already implemented. Loads the native
  bridge via `static probeAvailability()` and proxies inference to
  `detectPosesInVideoWithYolo`. **Keep.**
- `index.ts::resolvePoseProvider()` — chain is YOLO → Vision (iOS) →
  TFJS → Mock. **Keep.**

The `PoseProvider` interface normalizes to `Pose2D` with 17 COCO
keypoints in `[0,1]` image coordinates. Everything downstream
(`analysis/lifting`, `analysis/kinematics`, `domain/phases`,
`domain/scoring`) is agnostic to how the keypoints were produced —
swapping providers is a clean surface.

---

## 3. Model choice

**Pretrained Ultralytics YOLO-Pose nano variant** —
`models/pretrained/yolo26n-pose.pt` (current).

- Single-stage detector + pose head; natively COCO 17-keypoint.
- Exports cleanly to **CoreML** (iOS), **TFLite** (Android), and
  **ONNX** (cross-platform fallback) via the standard Ultralytics
  `model.export(format=…)` pipeline.
- Ships under AGPL-3.0 — see §7.

| Variant | Approx params | CoreML size (FP16) | iPhone 15 inference per frame | Notes |
| ------- | ------------- | ------------------ | ------------------------------ | ----- |
| `yolo26n-pose` (current) | ~3 M | ~7.5 MB (`.pt` source) | ~7–10 ms expected | Primary candidate; size + latency leave room for the §1.3 gates. |
| `yolo<NN>s-pose` | ~10 M | ~20 MB | ~16 ms | Fall-back if the nano variant fails the scoring-regression gate. Swap by dropping a different `.pt` into `models/pretrained/` and re-running the export. |

Decision gate: ship the smallest variant whose exported `.mlpackage` /
`.tflite` clears §1.3.

---

## 4. Keypoint schema

No change. 17 COCO keypoints in the order defined by `JOINT_NAMES`
(`src/domain/models/pose.ts`). YOLO-Pose emits exactly this layout, so
`VisionPoseProvider`'s mapping code is the template — and is already
mirrored in `YoloPoseProvider.ts`.

`Pose2D` output contract (unchanged):

```ts
interface Pose2D {
  frame: number;
  timestampMs: number;
  keypoints: Keypoint2D[]; // length 17, COCO order
  score: number;           // detection score for the best climber
}
```

---

## 5. Conversion + bundling

### 5.1 PyTorch → mobile

Two scripts under `scripts/export/`:

- `export_coreml.py --weights models/pretrained/yolo26n-pose.pt --half`
  → `modules/climbing-pose/ios/weights/yolo26n-pose.mlpackage`
- `export_tflite.py --weights models/pretrained/yolo26n-pose.pt --quant fp16`
  → `modules/climbing-pose/android/weights/yolo26n-pose.tflite`

Both wrap Ultralytics' built-in exporter; quantization (FP16, INT8) is
opt-in via flags. Run on any box with PyTorch installed — no GPU
needed.

### 5.2 Native bridge

The bridge is already wired under `modules/climbing-pose/`:

- iOS: `ClimbingPoseModule.swift` loads the bundled `.mlpackage` and
  exposes `detectPosesInVideoWithYolo(uri, fps, maxFrames?)`. Bump
  `MODEL_TAG` after each weight swap.
- Android: `ClimbingPoseModule.kt` loads the bundled `.tflite` via
  the NNAPI delegate where supported. Same `MODEL_TAG` discipline.

`isYoloPoseAvailable()` returns true only when the bundled artifact
is present at the expected platform path. The JS-side
`YoloPoseProvider.probeAvailability()` reads this and the resolver
falls back to Vision/Mock if it is false — verified by tests in
`tests/analysis/YoloPoseProvider.test.ts`.

### 5.3 Provider resolution

Backend policy via `EXPO_PUBLIC_ANALYSIS_POSE_BACKEND`:

- `'auto'` (default): YOLO → Vision (iOS) → TFJS → Mock.
- `'yolo'`: YOLO only, else Mock. Used for dogfood / scoring-regression evals.
- `'vision'`: Vision only on iOS, else Mock. Safety fallback.

---

## 6. Evaluation & gating

A converted artifact is only promotable if it clears **all** of these:

- [ ] Latency benchmark on iPhone 15 ≤ **6 s** end-to-end for a 15 s clip.
- [ ] Exported model size ≤ **15 MB**.
- [ ] **Scoring regression**: replay the existing analysis pipeline tests with the new provider on 10 seeded sessions; require all 8 category scores within ±5 of the Apple-Vision baseline.
- [ ] `liftConfidence` ≥ 0.7 on validation sessions.
- [ ] Crash rate < 0.5 % over a one-week dogfood window.

Failing any of these → the new model does not flip on by default;
keep Vision as the iOS default and either swap to the next-larger
variant or stay on Vision indefinitely. Record whatever was measured
in a model card alongside the bundled weights.

---

## 7. Integration

### 7.1 Provider — already implemented

`src/analysis/pose/YoloPoseProvider.ts`:

- `static probeAvailability()` — synchronous, never throws, returns
  true only when the native bridge reports a bundled weights file.
- `infer(req, onProgress?)` — proxies to the native bridge; throws
  `YoloProviderUnavailableError` on `NOT_BUNDLED` /
  `NATIVE_MODULE_MISSING` / `RUNTIME_ERROR` so the resolver can fall
  back cleanly.
- Source tag: `PoseSource = 'yolo'`. Existing screens
  (`SessionDetailScreen`, `CompareScreen`) treat anything other than
  `'mock'` as real inference, so no UI changes are needed.

### 7.2 Backwards compatibility

- `Pose2D` contract unchanged → zero changes in
  `analysis/lifting`, `analysis/kinematics`, `domain/`, `viz/`.
- Existing SQLite rows with `source: 'vision'` / `'moveNet'` stay
  readable. New sessions record `source: 'yolo'`.
- Demo (mock) sessions are unaffected.

### 7.3 Observability

Per-session pose stats can be written alongside the `poseTrack` blob
behind a dev-only flag: `{ meanConfidence, belowThresholdFrames,
inferenceMs }`. Surface `meanConfidence` in the debug panel on
`SessionScreen` when a dev build flag is set. (Optional;
nice-to-have, not a gate.)

---

## 8. Licensing & compliance

- **Ultralytics YOLO-Pose** is AGPL-3.0. Three options for shipping
  derived weights in a closed-source app:
  1. **Ship the converted weights only**, not training/export code,
     in the app bundle. Weights are not source code; legal review
     should confirm whether AGPL propagates. **Default plan; needs
     written legal sign-off before Step 5.**
  2. Purchase an **Ultralytics Enterprise License** to remove AGPL
     obligations entirely.
  3. Swap to **MMPose** (Apache-2.0) as plan B.
- The pretrained `.pt` itself is not committed (`*.pt` in
  `.gitignore`); the repo just records its expected location.
- **Privacy:** continue the no-network posture. No frames leave the
  device; analytics never include image content.

---

## 9. Rollout plan

| # | Step | Gate |
| - | ---- | ---- |
| 1 | `PoseSource: 'yolo'` + `YoloPoseProvider` + backend flag. | ✅ Type-check + mock path still works in Expo Go. |
| 2 | Drop pretrained `.pt` under `models/pretrained/`; export scripts in `scripts/export/`. | ✅ Done. |
| 3 | Convert `.pt` → CoreML; bundle on iOS; wire native bridge. | iPhone latency + on-device scoring regression recorded. |
| 4 | Convert `.pt` → TFLite; bundle on Android; wire native bridge. | Pixel 8 latency + on-device scoring regression recorded. |
| 5 | Flip `EXPO_PUBLIC_ANALYSIS_POSE_BACKEND` to `'yolo'` by default; keep `'vision'` as a debug fallback. | < 0.5 % crash rate over one week of dogfood sessions, §6 gates passed. |
| 6 | Remove `TFJSPoseProvider`; mark `VisionPoseProvider` deprecated with a one-release timer. | Docs updated. |

---

## 10. Risks & mitigations

| Risk | Likelihood | Mitigation |
| ---- | ---------- | ---------- |
| Pretrained YOLO-Pose underperforms on climbing-specific poses (heel hooks, overhang). | High | Keep Vision as the iOS fallback indefinitely (Step 6 stays gated); revisit fine-tuning as a separate spec only if §6 scoring regression fails. |
| AGPL license blocks shipping converted weights in a closed-source app. | Medium | Enterprise license or MMPose plan B. Legal review before Step 5. |
| On-device latency blows past 6 s. | Medium | Smaller variant (`*n-pose`); reduce `imgsz=480`; stride-sample at 8 fps instead of 10 fps. |
| CoreML / TFLite export loses accuracy (quantization drift). | Medium | Evaluate the **exported** artifact, not the `.pt`. Try `--quant fp32` if FP16 drifts; INT8 only if FP16 already passes and we want size reduction. |
| Pipeline latency increases analyze-session P95 enough that users abandon. | Low | Step 5 staged rollout monitors drop-off at the analysis step. |

---

## 11. Open questions

1. Legal review for AGPL — who and by when? Hard gate for Step 5.
2. Do we keep `VisionPoseProvider` as a permanent fallback on iOS,
   or delete it once YOLO is proven? (Leaning: keep for one release,
   then delete.)
3. Is the climbing-specific accuracy gap from the pretrained model
   acceptable for v1, or do we need to revisit fine-tuning before
   defaulting `'yolo'` on?

---

## 12. References

- Ultralytics YOLO-Pose docs: https://docs.ultralytics.com/tasks/pose/
- Ultralytics licensing: https://www.ultralytics.com/license
- Pose interface: `src/analysis/pose/PoseProvider.ts`
- Provider implementation: `src/analysis/pose/YoloPoseProvider.ts`
- iOS bridge: `modules/climbing-pose/ios/ClimbingPoseModule.swift`
- Android bridge: `modules/climbing-pose/android/ClimbingPoseModule.kt`
- Domain keypoint layout: `src/domain/models/pose.ts` (`JOINT_NAMES`)
- Export scripts: `scripts/export/`
- Pretrained weights location: `models/pretrained/`
- Product spec: [`docs/spec.md`](./spec.md)
- Architecture: [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)
