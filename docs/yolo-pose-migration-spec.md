# YOLO-Pose Migration — Technical Spec

**Version:** 0.2
**Status:** Scaffolding landed; awaiting training run.
**Owner:** Pose / Analysis
**Last updated:** 2026-04-24
**Related:** [`docs/spec.md`](./spec.md), [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md), `src/analysis/pose/`

**Rollout progress** (tracks §10 below):

- [x] Step 1 — `PoseSource: 'yolo'` + `YoloPoseProvider` skeleton + `EXPO_PUBLIC_ANALYSIS_POSE_BACKEND` flag.
- [x] Step 2 — `scripts/training/` pipeline + dataset manifest schema + model-card template.
- [ ] Step 3 — First training run on public-only data (baseline model card).
- [ ] Step 4 — Self-label 20k frames; iterate until §7 gates pass.
- [ ] Step 5 — Bundle CoreML weights; wire iOS native bridge.
- [ ] Step 6 — Bundle TFLite weights; wire Android native bridge.
- [ ] Step 7 — Staged default flip to `'yolo'`.
- [ ] Step 8 — Remove `TFJSPoseProvider`; deprecate `VisionPoseProvider`.

---

## 1. Summary

Replace the current off-the-shelf 2D pose stack (Apple Vision
`VNDetectHumanBodyPoseRequest` on iOS, MoveNet-Lightning via TFJS
elsewhere — referred to collectively as the "old MediaPipe-style model"
in product conversations) with a **climbing-fine-tuned Ultralytics
YOLO-Pose** model. Training data is assembled from public climbing
datasets plus self-labeled YouTube climbing footage. Ship the new model
through the existing `PoseProvider` boundary with no changes to
`domain/` or `analysis/` scoring code.

### 1.1 Why

- The generic COCO-trained models miss climbing-specific pose regimes:
  heel hooks, toe hooks, drop knees, dynos mid-flight, inverted hip-in,
  gastons, and flagging under steep overhang.
- `TFJSPoseProvider` is currently a stub (`NEEDS_DEV_BUILD`); the real
  runtime on iOS is Apple Vision, which is a black box we cannot fine-
  tune.
- Android lacks a real provider at all (falls back to mock), so score
  quality off-iOS is demo-only.
- Roadmap already names a "YOLO fine-tune" (`docs/spec.md` §12,
  `README.md` line 137) for hold detection — we converge pose + hold
  detection on one training stack.

### 1.2 Non-goals

- Changing the domain keypoint schema (stay 17-keypoint COCO layout —
  see `JOINT_NAMES` in `src/domain/models/pose.ts`).
- Replacing the pseudo-3D lifter, phase segmentation, or scoring
  engine.
- Training a 3D pose model from video (v2).
- Cloud inference. All inference stays on-device.
- Removing `MockPoseProvider` — it remains for Expo Go demos and tests.

### 1.3 Success metrics

| Metric | Baseline (Apple Vision on iOS) | Target (YOLO-Pose, on-device) |
| ------ | ------------------------------ | ----------------------------- |
| Per-keypoint OKS (climber-only eval set) | ~0.62 | **≥ 0.78** |
| mAP@0.50:0.95 (pose, climber-only)       | ~0.48 | **≥ 0.65** |
| Fraction of reach/dyno frames with all 17 keypoints visible+confident | ~55% | **≥ 80%** |
| Heel-hook / inverted-hip frame accuracy  | ~0.40 | **≥ 0.70** |
| End-to-end analysis latency for a 15 s clip, iPhone 15 | ~4 s | **≤ 6 s** |
| Model size (on-device, quantized)        | n/a (Vision is system) | **≤ 15 MB** |
| Analysis crash rate                      | — | **< 0.5 %** |

Baselines will be measured on the eval set (§5.3) before any training
commits, to make gains attributable.

---

## 2. Current state (what we are replacing)

`src/analysis/pose/`:

- `PoseProvider.ts` — abstract boundary. **Keep.**
- `MockPoseProvider.ts` — seeded, deterministic; used for Expo Go and
  tests. **Keep.**
- `VisionPoseProvider.ts` → `modules/climbing-pose` (iOS,
  `VNDetectHumanBodyPoseRequest`). **Replace or wrap.**
- `TFJSPoseProvider.ts` — stub that throws `NEEDS_DEV_BUILD`.
  **Replace.**
- `index.ts::resolvePoseProvider()` — resolution priority:
  iOS Vision → TFJS → Mock. **Update to prefer YOLO.**

The `PoseProvider` interface already normalizes to `Pose2D` with 17
COCO keypoints in `[0,1]` image coordinates plus a per-point
`confidence`. Everything downstream (`analysis/lifting`,
`analysis/kinematics`, `domain/phases`, `domain/scoring`) is agnostic
to how the keypoints were produced — a clean swap surface.

---

## 3. Model choice

### 3.1 Architecture

**Ultralytics YOLO11-Pose (`yolo11n-pose`, `yolo11s-pose`)**.

- Single-stage detector + pose head; natively COCO 17-keypoint.
- Exports cleanly to **CoreML** (iOS), **TFLite** (Android), and
  **ONNX** (cross-platform fallback).
- Ships under AGPL-3.0 — see §9 for licensing implications.

Candidate sizes:

| Variant | Params | CoreML size (FP16) | iPhone 15 inference per frame | Notes |
| ------- | ------ | ------------------ | ------------------------------ | ----- |
| `yolo11n-pose` | 2.9 M  | ~6 MB  | ~7 ms  | Primary candidate, best fit for on-device. |
| `yolo11s-pose` | 9.9 M  | ~20 MB | ~16 ms | Fallback if `n` does not hit accuracy targets. |
| `yolo11m-pose` | 26 M   | ~52 MB | ~40 ms | Only if `s` is still insufficient; unlikely. |

Decision gate: train both `n` and `s` on the full dataset; pick the
smallest variant that meets §1.3 targets.

### 3.2 Why not alternatives

- **MoveNet / BlazePose** — not fine-tunable on our dataset without
  re-implementing the training loop; weights licensed for use, not for
  retraining.
- **RTMPose** — strong accuracy, but less mature mobile export story
  than Ultralytics.
- **ViTPose** — transformer cost is prohibitive on-device.
- **MediaPipe Pose** — 33-keypoint topology diverges from our 17-COCO
  domain model; a remap loses information and increases risk.

---

## 4. Keypoint schema

No change. 17 COCO keypoints in the order defined by `JOINT_NAMES`
(`src/domain/models/pose.ts`). YOLO-Pose emits exactly this layout, so
`VisionPoseProvider`'s mapping code is the template for the new
provider.

`Pose2D` output contract (unchanged):

```ts
interface Pose2D {
  frame: number;
  timestampMs: number;
  keypoints: Keypoint2D[]; // length 17, COCO order
  score: number;           // detection score for the best climber
}
```

If the new provider ever needs richer output (e.g. per-keypoint
visibility), extend `Pose2D` with optional fields only — never break
the 17-COCO contract.

---

## 5. Training data strategy

Target: ~**40 k labeled climber frames** for v1, split 80/10/10
train/val/test, stratified by (wall_angle, move_type, climber_bib).
All training data is out-of-device; the trained weights are the only
thing shipped.

### 5.1 Public datasets

Assemble from open sources. **Every dataset listed here must have its
license verified by a human before use — do not assume "public" means
"redistributable".** Two parallel training tracks: a **commercial-clean
shipping** track and a **research-only** track that informs ablations
and ceiling estimates but never produces shipped weights.

> **Verified 2026-04-26 — CIMI4D + ClimbingCap are research-only.** The
> LiDAR Human Motion site license (http://www.lidarhumanmotion.net/license/)
> explicitly prohibits using the dataset to train methods/algorithms/neural
> networks for *commercial use of any kind*, prohibits redistribution, and
> permits one archive copy. They are excluded from the shipping training
> set; see `docs/yolo_pose_dataset_candidates.md` for the full scout
> report.

| Source | Content | Expected volume | License | Track | Action |
| ------ | ------- | --------------- | ------- | ----- | ------ |
| **COCO-Pose 2017** | General human pose | full (warmstart only) | CC-BY-4.0 | Both | Pretrain init (already Ultralytics default). |
| **VAF Bouldering Poses (Roboflow)** | Climbing KPs (native COCO-17) | ~41 images | CC-BY 4.0 | Both | Tiny but commercially-clean climbing KP sanity set. |
| **AIST++** | Articulated dance pose (COCO-17) | ~10.1 M frames (sample subset) | CC-BY 4.0 (annotations); underlying video license separate | Both | Auxiliary range-of-motion breadth. |
| **MPII Human Pose** | General human pose incl. some climbing | ~25 k frames, ~200 climbing | Research-only (BSD for annotations; images not licensed for commercial use) | Research-only | Climbing subset only; do not include in commercial weights. |
| **Penn Action** | Sports pose incl. pull-ups | ~2 k relevant frames | Academic | Research-only | Climbing-adjacent frames; verify per-clip terms before any commercial use. |
| **CIMI4D** (CVPR 2023) | RGB + LiDAR + IMU + SMPL poses | ~180 k frames | LiDAR Human Motion site license — **non-commercial training only** | Research-only | Excluded from shipping weights. SMPL→COCO-17 conversion required even for research use. |
| **ClimbingCap / AscendMotion** (CVPR 2025) | RGB + LiDAR + IMU, multi-modal | ~412 k frames | LiDAR Human Motion site license — **non-commercial training only** | Research-only | Same status as CIMI4D. |
| **Roboflow Universe — other climbing projects** | Community-labeled climbing (mostly hold detection) | 3–8 k (varies) | Per-project (mostly CC-BY) | Both (per-project) | Useful for image source and auto-labeling; verify each project's license. |
| **The Way Up (Zenodo)** | 22 climbing videos with hold-usage labels | 22 videos | Zenodo record — license tag pending verification | Both (pending) | Frame-sample for pseudo-labeled poses **after** confirming the record's CC variant. |
| **BoulderAct / ClimbAlong / DeepClimb-style research sets** | Published climbing datasets (IROS/CVPRW/ICIP 2020–2025) | 5–15 k | Research — request | Research-only | Contact authors for any commercial redistribution terms. |
| **Internet Archive + YouTube/Vimeo (CC-BY climbing channels)** | Long-form climbing | 100+ hours raw | Per-video CC; filter NC/ND if shipping commercially | Both | Primary volume source for the commercial weights; frame-sample and self-label. |

Minimum floor before training: at least **15 k climbing-specific
frames** from licensed sources. If public sources fall short, the gap
is closed by the self-labeled set (§5.2).

### 5.2 Self-labeled footage

- Source: public climbing videos explicitly marked **CC-BY** or
  **CC-BY-SA** (filter YouTube by Creative Commons; verify per video).
- Annotate via **CVAT** or **Label Studio** using auto-label +
  human-correct:
  1. Bootstrap labels with `yolo11m-pose` + `Apple Vision` consensus.
  2. Human corrects frames below an agreement threshold.
  3. ~30 % of frames hand-labeled from scratch to avoid auto-label
     bias.
- Target: **20 k frames** covering:
  - Slab (0–5° overhang) — 20 %
  - Vertical (85–95°) — 25 %
  - Overhang (100–135°) — 35 % (highest value; current models worst here)
  - Roof (>150°) — 10 %
  - Outdoor sandstone/granite/limestone — 10 %
  - Explicit heel hooks, drop knees, flags, gastons tagged per frame
- Climber diversity: min 3 body types, min 3 skin tones, min 30 %
  female climbers. Record-keeping in `dataset/manifest.json`.

### 5.3 Evaluation set

- Held-out **test set** of ~**3 k frames** never seen during training
  or hyperparameter search.
- Includes an explicit **"hard moves" slice**: heel hooks, inverted,
  mid-dyno, match — at least 100 frames per category.
- Labeled by two annotators; Cohen's κ ≥ 0.85 required to admit a
  frame.
- Checked into DVC (data version control) with a content hash; a
  model run is only valid against a named eval-set revision.

### 5.4 Data pipeline layout

```
data/
  raw/                       # original videos and public-dataset archives
  manifests/                 # YAML per source: license, consent, hash
  frames/                    # extracted frames (not committed, DVC-tracked)
  labels/                    # YOLO-format .txt labels
  splits/train.txt
  splits/val.txt
  splits/test.txt
  eval_slices/               # hard-moves slice files
```

Scripts (new, live in `scripts/training/`, not shipped to the app):

- `extract_frames.py` — sample from video at configurable fps.
- `bootstrap_labels.py` — auto-label with ensemble, emit confidence.
- `reconcile_cocoformat.py` — remap MPII / research sets to 17-COCO.
- `dataset_sanity.py` — fail on license-missing, keypoint-order
  mismatch, duplicate hashes.

---

## 6. Training

### 6.1 Environment

- Ultralytics `ultralytics>=8.3`.
- Python 3.11, CUDA 12.x.
- Target hardware: single H100 or 2×A100 for v1. Budget ~48 GPU-hours
  total.
- Experiment tracking: Weights & Biases project `climbing-pose`.
- DVC for data, Git for code; `dataset@revN` + `code@commitN` produce
  a reproducible run ID.

### 6.2 Pretraining warmstart

Start from Ultralytics COCO-Pose checkpoints (`yolo11n-pose.pt`,
`yolo11s-pose.pt`). Do **not** train from scratch — it wastes compute
and underperforms on our data volume.

### 6.3 Augmentations

Climbing-aware augmentations matter:

- **Rotation** ±20° (wall photos tilt).
- **HSV jitter**, especially value (gym lighting varies wildly).
- **Random crop** + **scale 0.5–1.5** (telephoto vs wide phone).
- **Mosaic** — keep Ultralytics default for first 80 % of epochs.
- **Motion blur** simulation for dyno frames.
- **NO horizontal flip during the last 20 epochs** — left/right
  keypoint labels matter for `flagging` and `hip_positioning`
  scoring; late-stage flips degrade left-vs-right discrimination.

### 6.4 Hyperparameters (starting point)

```yaml
epochs: 200
batch: 64           # auto-adjust by GPU
imgsz: 640
optimizer: AdamW
lr0: 0.001
lrf: 0.01
weight_decay: 0.0005
warmup_epochs: 3
patience: 30        # early stop
box: 7.5
pose: 12.0          # weight pose loss higher than default (10.0)
kobj: 2.0
kpt_shape: [17, 3]
flipidx: [0,2,1,4,3,6,5,8,7,10,9,12,11,14,13,16,15]
```

Tuning priorities: `pose` loss weight, image size (720 vs 640 on
overhang crops), early-stop patience.

### 6.5 Curriculum

1. **Phase A (epochs 1–60):** full public + self-labeled, standard
   augmentation.
2. **Phase B (epochs 61–140):** oversample overhang + hard moves 3×.
3. **Phase C (epochs 141–200):** fine-tune at higher `imgsz=768`,
   flip augmentation off, small lr.

Checkpoints saved every 10 epochs; best model chosen on **val OKS
weighted by move-type rarity**, not vanilla OKS.

---

## 7. Evaluation & gating

A trained model is only promotable if it clears **all** of these
before the PR merges:

- [ ] Test-set OKS ≥ 0.78 overall and ≥ 0.65 on the hard-moves slice.
- [ ] Per-keypoint confidence ≥ 0.5 on ≥ 80 % of frames in the reach/
      dyno subset.
- [ ] Latency benchmark on iPhone 15 (§8.2) ≤ 6 s end-to-end for a
      15 s clip.
- [ ] Model file ≤ 15 MB after quantization.
- [ ] No regression on scoring — replay the existing analysis pipeline
      tests with the new provider and require:
      - All 8 category scores within ±5 of the Apple-Vision baseline on
        10 seeded sessions.
      - `liftConfidence` stays ≥ 0.7 on the validation sessions.
- [ ] Bias check: keypoint OKS gap between demographic slices
      (female/male, light/dark skin) < 0.05.

Failing any of these → the new model does not ship; keep the old
provider as default and iterate. Recorded in
`docs/model_cards/yolo-pose-v1.md` (new).

---

## 8. Integration

### 8.1 New provider

`src/analysis/pose/YoloPoseProvider.ts`:

```ts
export class YoloPoseProvider implements PoseProvider {
  readonly name = 'climber-yolo11n-v1';
  readonly isRealInference = true;
  readonly source: PoseSource = 'yolo'; // new variant — extend enum
  async infer(req, onProgress?) { /* native bridge */ }
}
```

- `PoseSource` enum in `src/domain/models/pose.ts` gains `'yolo'`.
  Existing callers are all switch-exhaustive, so this forces an
  explicit update where needed — that is the point.
- iOS: CoreML `.mlpackage` bundled in the app; native bridge lives
  under `modules/climbing-pose/` (reuse the module; rename exports if
  we want to deprecate the Vision path or keep it as fallback).
- Android: TFLite model + ObjectDetector-style native module
  (`modules/climbing-pose/android/`). This also unblocks the Android
  real-inference story.
- Cross-platform fallback: ONNX Runtime Web, only for a future web
  build.

### 8.2 Provider resolution

Update `resolvePoseProvider()` priority to:

1. `YoloPoseProvider` (if bundled model and native runtime load).
2. `VisionPoseProvider` (iOS only) — retained as fallback for one
   release, then removed.
3. `TFJSPoseProvider` — removed (the stub is deleted).
4. `MockPoseProvider` — last-resort and Expo Go.

Feature-flag the switchover via a config key
`ANALYSIS_POSE_BACKEND = 'yolo' | 'vision' | 'auto'` in
`app.config.ts` so we can toggle without a rebuild during rollout.

### 8.3 Backwards compatibility

- `Pose2D` contract is unchanged → zero changes in `analysis/lifting`,
  `analysis/kinematics`, `domain/`, `viz/`.
- Existing SQLite rows with `source: 'vision'` or `'moveNet'` stay
  readable. New sessions record `source: 'yolo'`.
- Demo sessions (mock) are unaffected.

### 8.4 Observability

Add (behind a dev-only flag, still no network):

- Per-session pose stats written alongside the `poseTrack` blob:
  `{ meanConfidence, belowThresholdFrames, inferenceMs }`.
- Surface `meanConfidence` in the debug panel on `SessionScreen` when
  a dev build flag is set.

---

## 9. Licensing & compliance

- **Ultralytics YOLO11** is AGPL-3.0. Three options:
  1. **Ship trained weights only**, not the training code, in the
     app bundle. Weights are not themselves source code; legal review
     confirms whether AGPL propagates to the app. **(Default plan —
     needs written legal sign-off before shipping.)**
  2. Purchase an **Ultralytics Enterprise License** (one-time / annual)
     to remove AGPL obligations entirely. Budget line: ~$TBD.
  3. Swap to **MMPose** (Apache-2.0) as a plan B if legal does not
     clear option 1 and option 2 is declined.
- **Training data**: per-source license file in `data/manifests/`,
  never commit unlicensed frames.
- **Privacy**: continue the product's no-network posture. No frames
  leave the device; no analytics include image content.

---

## 10. Rollout plan

Each step is a separate PR with its own tests and review.

| # | Step | Gate |
| - | ---- | ---- |
| 1 | Add `PoseSource: 'yolo'` and `YoloPoseProvider` skeleton (throws "not bundled"). | Type-check + mock path still works in Expo Go. |
| 2 | Build & commit `scripts/training/` + dataset manifest schema. | `dataset_sanity.py` passes on a 100-frame toy set. |
| 3 | First training run on public-only data; publish model card. | §7 gates evaluated honestly — *expected to fail*, which is fine; establishes baseline. |
| 4 | Self-label 20 k frames; retrain; iterate until §7 gates pass. | §7 all ✅. |
| 5 | Bundle CoreML weights; wire up iOS native bridge. | iPhone latency + on-device accuracy benchmark recorded. |
| 6 | Bundle TFLite weights; wire up Android native bridge. | Pixel 8 latency + on-device accuracy benchmark recorded. |
| 7 | Flip `ANALYSIS_POSE_BACKEND` to `'yolo'` by default in a staged rollout behind a config flag; keep `'vision'` as a debug fallback. | 0.5 % crash rate threshold over 1 week of dogfood sessions. |
| 8 | Remove `TFJSPoseProvider`; mark `VisionPoseProvider` deprecated with a one-release timer. | Docs updated. |

---

## 11. Risks & mitigations

| Risk | Likelihood | Mitigation |
| ---- | ---------- | ---------- |
| Public climbing data is too thin → model underfits hard moves. | High | Self-labeled 20 k frames budgeted; expand if gates fail. |
| AGPL license blocks shipping trained weights in a closed-source app. | Medium | Enterprise license or MMPose plan B. Legal review before step 5. |
| On-device latency blows past 6 s. | Medium | Fall back to `yolo11n-pose` at `imgsz=480`; stride-sample at 8 fps instead of 10 fps. |
| CoreML export loses accuracy (quantization drift). | Medium | Evaluate the exported `.mlpackage` directly, not just the PyTorch model. |
| Annotation bias skews scoring (e.g. models only trained on expert climbers). | Medium | Diversity quotas in §5.2; bias check in §7 gates. |
| Left/right mislabel breaks `flagging` score. | High if flip aug left on | Disable h-flip in Phase C; regression test with a fixed left-flag clip. |
| Pipeline latency increases analyze-session P95 enough that users abandon. | Low | Step 7 staged rollout monitors drop-off at the analysis step. |

---

## 12. Open questions

1. Do we want to collapse hold-detection (the other "YOLO fine-tune"
   on the roadmap) into the **same** training project to share a
   backbone? Probably yes — saves ~50 % on-device model budget.
2. Is Android real-inference in v1 scope, or fast-follow? (Leaning:
   in scope — the Android fallback to mock is a known product gap.)
3. Do we keep `VisionPoseProvider` as a permanent fallback on iOS, or
   delete it once the YOLO path is proven? (Leaning: keep for one
   release, then delete.)
4. Legal review for AGPL — who and by when?

---

## 13. References

- Ultralytics YOLO-Pose docs: https://docs.ultralytics.com/tasks/pose/
- Ultralytics licensing: https://www.ultralytics.com/license
- Existing pose interface: `src/analysis/pose/PoseProvider.ts`
- Existing iOS bridge: `modules/climbing-pose/ios/ClimbingPoseModule.swift`
- Existing domain keypoint layout: `src/domain/models/pose.ts`
  (`JOINT_NAMES`)
- Product spec: [`docs/spec.md`](./spec.md)
- Architecture: [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)
