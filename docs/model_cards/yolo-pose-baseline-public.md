# Model card — `climber-yolo11n-baseline-public`

**Status: NOT TRAINED. DO NOT USE.** This card exists to document the
*attempted* first public-only baseline training run in honest form.
No weights were produced, no metrics were measured, and no artifact
was exported. Nothing in this card should be read as an endorsement
of the model; there is no model.

**Agent:** Model Card Writer (Agent 5)
**Spec reference:** [`docs/yolo-pose-migration-spec.md`](../yolo-pose-migration-spec.md) §5.1, §5.4, §6, §7
**Template reference:** [`docs/model_cards/yolo-pose-v1.md`](./yolo-pose-v1.md)
**Upstream agents:**
- Dataset scout (Agent 1) — [`docs/yolo_pose_dataset_candidates.md`](../yolo_pose_dataset_candidates.md)
- License auditor (Agent 2) — [`data/manifests/source_review.md`](../../data/manifests/source_review.md)
- Dataset converter (Agent 3) — [`docs/yolo_pose_dataset_conversion.md`](../yolo_pose_dataset_conversion.md)
- Training runner (Agent 4) — [`docs/yolo_pose_baseline_results.md`](../yolo_pose_baseline_results.md)

---

## 1. Identity

| Field | Value |
| ----- | ----- |
| Model tag | `climber-yolo11n-baseline-public` (reserved; no weights bound to this tag) |
| Intended architecture | Ultralytics YOLO11n-Pose |
| Intended warmstart | `yolo11n-pose.pt` (COCO-Pose) |
| Weights produced | **None.** `runs/climbing-pose/baseline-public/` does not exist on disk. |
| Training code commit | `37b031d89edcbb22eba6ac27d633090899cd40af` (branch `feat/wall-detection-gate`, 2026-04-24). This is the commit at which the attempt was recorded; no training code was executed. |
| Config commit for `datasets/climbing-pose/climbing-pose.yaml` | Same as above — scaffold only, no frames. |
| Date (of this card) | 2026-04-24 |
| Training box | Not used. Attempt recorded from a macOS 26.3.1 arm64 dev laptop with no CUDA GPU, no Ultralytics install, and Python 3.9.6 / 3.14.2 (no wheel for pinned `torch==2.4.1`). |
| Maintainer | Unassigned — this run was blocked upstream. |

## 2. Intended use

**Intended (future) use:**
2-D human pose estimation for climbers in the Climbing Coach app, to
replace the Apple Vision / MoveNet backend for `analyzeSession()`.
17-keypoint COCO schema.

**Out of scope — even once the model exists:**
- Medical, biomechanical, or injury-risk assessment.
- Identifying individuals.
- Any use not covered by the licenses of the training sources.

**Current actual use: none.** There are no weights. Do not ship, do
not embed, do not benchmark against other backends — there is nothing
to compare.

---

## 3. Training data — sources and license status

Two sources were **cleared by license audit** (Agent 2) for the
public-only baseline. Neither was actually ingested (Agent 3 did not
download frames), and neither manifest has been signed by a human.
Until a named human signs the per-source manifests and fills real
`contentHash` values, this model cannot be trained or shipped.

| # | Source | Role | SPDX / stated license | Audit status | Manifest signed? | Ingested? |
| - | ------ | ---- | --------------------- | ------------ | ---------------- | --------- |
| 1 | COCO Keypoints 2017 / COCO-Pose | Pretrain / warmstart (intended `train/` + `val/`) | Annotations **CC BY 4.0**; images Flickr-origin, per-image Flickr terms | `APPROVED_FOR_BASELINE` | **No** — `license.verifiedBy: null` in `data/manifests/coco-pose-2017.yaml` | **No** |
| 2 | VAF Bouldering Poses (Roboflow Universe) | Tiny climbing-slice eval (intended `test/`; ~41 images) | **CC BY 4.0** (as stated on Roboflow project page; screenshot required before sign-off) | `APPROVED_FOR_BASELINE` | **No** — `license.verifiedBy: null` in `data/manifests/roboflow-vaf-bouldering-poses.yaml` | **No** |

### Sources considered and rejected (not in this run)

From [`data/manifests/source_review.md`](../../data/manifests/source_review.md):

- **`DO_NOT_USE`** — Kinetics-700, ActivityNet (both YouTube-license on
  underlying videos).
- **`RESEARCH_ONLY`** — MPII Human Pose; CIMI4D and ClimbingCap /
  AscendMotion (both verified 2026-04-26 against the LiDAR Human
  Motion project license at http://www.lidarhumanmotion.net/license/
  — commercial training prohibited, no redistribution, "AS IS").
  Not safe for a shipping commercial model. Permitted only in a
  non-shipped research baseline that is never bundled into the app.
- **`NEEDS_PERMISSION`** — PoseTrack21, YouTube CC, Vimeo CC,
  Wikimedia Commons. No approved items yet.
- **`APPROVED_FOR_BASELINE` (Phase 2 / Step 4 only — no pose labels
  shipped)** — "The Way Up" (Zenodo 15196867; DOI
  10.5281/zenodo.15196867). Verified 2026-04-26: **CC-BY-4.0**, 22
  annotated climbing videos (~20.9 GB, single `dataset.zip`,
  MD5 `a46cbca826a7f28ab591a4900ce5a1c9`), University of Applied
  Sciences Upper Austria (Maschek, Schedl), 2025-04-12. Hold-usage
  annotations only — **no pose keypoints**. Commercial use permitted
  with attribution. Suitable as a Step-4 self-labeling video source,
  not as a Step-3 training source.
- **`UNKNOWN_LICENSE`** — AIST++ (video-layer license unverified),
  CrowdPose, Penn Action, Roboflow hold-detector sets. Each must be
  re-verified by a human before re-entering the manifest pool.

### Attribution boilerplate (for the eventual shipped model card)

```
Training data attribution
-------------------------

COCO-Pose 2017 (pretrain)
  (c) Microsoft COCO Consortium. Licensed under CC BY 4.0.
  https://cocodataset.org/

VAF Bouldering Poses (climbing sanity set)
  (c) VAF (Roboflow Universe). Licensed under CC BY 4.0.
  https://universe.roboflow.com/vaf/bouldering-poses
```

This block is reproduced verbatim from Agent 2's audit. It applies to
the *intended* training set. Because training did not occur, this
model has no training-data attribution of its own to declare.

---

## 4. Dataset size and split

| Split | `datasets/climbing-pose/images/` | `datasets/climbing-pose/labels/` | Planned source |
| ----- | -------------------------------- | -------------------------------- | -------------- |
| train | **0** (only `.gitkeep`) | **0** (only `.gitkeep`) | COCO-Pose 2017 (`person_keypoints_train2017`) |
| val   | **0** (only `.gitkeep`) | **0** (only `.gitkeep`) | COCO-Pose 2017 (`person_keypoints_val2017`) |
| test  | **0** (only `.gitkeep`) | **0** (only `.gitkeep`) | VAF Bouldering Poses (~41 images) |

**Total frames ingested: 0.** Spec §5.1 requires ≥ 15 000 labeled
climber frames from licensed sources before a run can be called a
"real" baseline. The planned sources cover that floor on paper
(COCO-Pose alone contributes ~250 k person instances from ~200 k
images), but nothing has been fetched.

`python scripts/training/dataset_sanity.py --root data` returns
**`FAIL (14 error(s))` / exit 1** on the current tree, which is the
intended refusal state. `scripts/training/train.py::run_sanity` aborts
on that exit code — which is why no training ran.

### Known dataset hygiene gaps

- `data/splits/{train,val,test}.txt` are missing —
  `scripts/training/extract_frames.py` has not been executed.
- Both per-source manifests still carry placeholder
  `contentHash: sha256:0000…0000`.
- VAF → COCO-17 keypoint order mapping (`data/manifests/attribution/vaf_to_coco17.json`)
  has not been authored. `scripts/training/convert_vaf_to_coco17.py`
  refuses to guess.
- `data/manifests/public_baseline_sources.yaml` is a roll-up, not a
  per-source manifest, and fails schema validation in place. It should
  move to `docs/` before the sanity gate can exit clean.

---

## 5. Training command

### 5.1 Command prescribed for this run (not executed)

```bash
yolo pose train \
  model=yolo11n-pose.pt \
  data=datasets/climbing-pose/climbing-pose.yaml \
  epochs=50 \
  imgsz=640 \
  batch=16 \
  project=runs/climbing-pose \
  name=baseline-public
```

**Executed: no.** Preconditions (see §7) were not met.

### 5.2 Alternate form (also not executed)

The project's in-repo trainer with strict sanity:

```bash
python scripts/training/train.py \
  --config scripts/training/climbing_pose.yaml \
  --model yolo11n-pose.pt \
  --data-root data \
  --project runs/climbing-pose \
  --run-name baseline-public \
  --phases a \
  --phase-a-epochs 50 \
  --imgsz 640 \
  --strict-sanity
```

The two CLI forms point at **different** on-disk layouts
(`datasets/climbing-pose/climbing-pose.yaml` vs the DVC-backed
`scripts/training/climbing_pose.yaml`). They must be reconciled before
the first real training run — see §9 recommendation #6.

### 5.3 Environment (intended — per spec §6.1)

- Ultralytics `8.3.40`
- PyTorch `2.4.1`, torchvision `0.19.1`
- Python `3.11`
- CUDA 12 / A100-class GPU (or Apple Silicon with MPS; slower)
- DVC, opencv-python-headless, tensorflow `2.17.0`, coremltools `8.0`

None of the above is installed on the host that recorded this run.

---

## 6. Metrics

Every metric below is marked **not measured**. No values were
estimated, extrapolated, or inferred from proxy data. A "not measured"
cell means literally: no prediction file exists to compute this on.

| Metric | Spec §1.3 / §7 target | Measured | Notes |
| ------ | --------------------- | -------- | ----- |
| mAP@0.50:0.95 (pose, climber-only) | ≥ 0.65 | **not measured** | No trained weights. |
| OKS overall (climber-only test set) | ≥ 0.78 | **not measured** | Test set not ingested. |
| OKS hard-moves slice (heel hook, toe hook, drop knee, flag, mid-dyno, inverted) | ≥ 0.65 | **not measured** | Slice not built; labels not available. |
| % reach/dyno frames with ≥ 17 keypoints ≥ 0.5 confidence | ≥ 80 % | **not measured** | No reach/dyno subset. |
| iPhone 15 per-frame inference (exported) | ≤ ~7 ms | **not measured** | No Core ML export. |
| iPhone 15 end-to-end latency (15 s clip) | ≤ 6 s | **not measured** | No exported artifact. |
| Bundled model size after quantization | ≤ 15 MB | **not measured** | No export. |
| `liftConfidence` on validation sessions | ≥ 0.7 | **not measured** | No runtime artifact. |
| Scoring regression — 8 category scores vs Vision baseline, 10 seeded sessions | all 8 within ±5 | **not measured** | No runtime artifact to feed `analyzeSession()`. |
| Demographic OKS gap between slices | < 0.05 | **not measured** | No eval set; no demographic metadata. |
| Overhang vs vertical OKS gap | < 0.05 | **not measured** | No wall-angle slice. |

### 6.1 Qualitative failure cases

**None inspected.** No predictions were produced. `runs/climbing-pose/`
does not exist; there are no `val_batch*_pred.jpg` mosaics, no
inference images, and no failure samples to critique.

Where a real first run is likely to fail (predictions from upstream
evidence, not measurement):

- Back-facing climbers with hands above shoulders.
- Heel-hook and toe-hook poses — COCO-Pose has essentially no such
  geometry, and the ~41-frame VAF eval slice is gym-vertical, not
  overhang/roof.
- Roof climbing (inverted torso) — no training signal at all.
- Occluded limbs behind volumes / hold clusters.

These are hypotheses to validate, not observed failures.

---

## 7. Spec §7 gate evaluation — pass / fail / not evaluated

Per task rules: reporting PASS or FAIL without a measurement would be
a fabrication. Every gate for this run is **NOT EVALUATED**.

| # | Spec §7 gate | Status | Why |
| - | ------------ | ------ | --- |
| 1a | Test-set OKS ≥ 0.78 overall | **NOT EVALUATED** | No weights, no test predictions. |
| 1b | OKS ≥ 0.65 on hard-moves slice | **NOT EVALUATED** | Hard-moves slice not built. |
| 2 | Per-keypoint confidence ≥ 0.5 on ≥ 80 % of reach/dyno frames | **NOT EVALUATED** | No reach/dyno subset. |
| 3 | iPhone 15 latency ≤ 6 s end-to-end for a 15 s clip | **NOT EVALUATED** | No Core ML export. |
| 4 | Exported model size ≤ 15 MB after quantization | **NOT EVALUATED** | No export. |
| 5 | `analyzeSession` 8 category scores within ±5 of Apple-Vision baseline on 10 seeded sessions | **NOT EVALUATED** | No runtime artifact to feed through the pipeline. |
| 6 | `liftConfidence` ≥ 0.7 on validation sessions | **NOT EVALUATED** | No runtime artifact. |
| 7 | Demographic OKS slice gap < 0.05 | **NOT EVALUATED** | No eval set, no demographic metadata in manifests. |

**Overall: blocked at the data-ingest gate — no Spec §7 gate has been
measured on this run.** This is consistent with the Spec §10 rollout
plan for Step 3 ("expected to fail; establishes baseline"). What
failed here is the data layer, not the model — because the model was
never trained.

---

## 8. Bias, diversity and known limitations

Because no model was trained, there is no *measured* bias to report.
The **expected** biases, given the intended training mix, are:

- **Climbing geometry is under-represented.** COCO-Pose is
  general-person imagery with essentially no climbing scenes. Expect
  the eventual baseline to be weak on back-facing climbers, overhang
  torso angles, heel / toe hooks, and inverted roof poses — until
  self-labeled climbing footage (Spec §5.2, Step 4) is added.
- **No demographic / skin-tone metadata.** The current manifests
  (`coco-pose-2017.yaml`, `roboflow-vaf-bouldering-poses.yaml`) do not
  carry demographic fields. Spec §7 gate 7 (OKS slice gap < 0.05)
  cannot be measured without those fields, so the bias gate will stay
  `NOT EVALUATED` even once weights exist, until the labeling schema
  is extended.
- **Tiny climbing eval.** ~41 images from VAF is below any reasonable
  statistical threshold. OKS numbers derived from 41 frames will be
  noisy and should not be used to compare provider backends.
- **No roof / overhang coverage.** Spec §5.2 calls for 35 % overhang +
  10 % roof in the self-labeled set precisely because the public-only
  baseline is known-weak there. The 41-frame VAF sample is all-gym
  and mostly vertical.
- **Flickr image provenance.** COCO images are Flickr-origin. This is
  typical amateur photography with over-representation of well-lit
  daytime scenes, and under-representation of low-light gym shots,
  moonboard-style training walls, and night-time outdoor climbing.
- **Single-climber assumption.** The scaffold config has a single
  `climber` class; multi-climber scenes are not a target for Step 3.

These are **predicted** limitations. The moment a real test run
produces numbers, this section must be rewritten in place with
measured values and any newly discovered failure modes added.

---

## 9. Recommendation for Step 4 — self-labeling

**Do not ship or benchmark anything from this run.** Before Step 4
(self-labeling + fine-tune pipeline) begins, the upstream blockers
must be resolved:

### 9.1 Unblock Step 3 first (in this order)

1. **Human license sign-off on both manifests.** A named human writes
   a real `license.verifiedBy` + `license.verifiedAt` into
   `data/manifests/coco-pose-2017.yaml` and
   `data/manifests/roboflow-vaf-bouldering-poses.yaml`. Never an agent.
2. **VAF screenshot + keypoint mapping JSON.** Save the CC-BY-4.0 tag
   screenshot to `data/manifests/attribution/roboflow-vaf-bouldering-poses.png`
   and author `data/manifests/attribution/vaf_to_coco17.json`.
3. **Move the audit roll-up out of `data/manifests/`.** It fails
   schema validation in place; relocate to
   `docs/public_baseline_sources_audit.yaml`.
4. **Fetch COCO-Pose on a training box** (never on a dev laptop; never
   committed), compute `contentHash`, update `frameCount`, regenerate
   `data/splits/{train,val,test}.txt` via `extract_frames.py`.
5. **Export + convert VAF** via
   `scripts/training/convert_vaf_to_coco17.py` with the explicit
   mapping JSON. Compute and record the export-zip hash.
6. **Run sanity until it exits 0.** If it does not, fix the root
   cause. Never invoke `train.py --skip-sanity` in anything other than
   a throwaway dev shell.
7. **Run the baseline.** Replace every "not measured" and "NOT
   EVALUATED" in this card with real values.

### 9.2 Then — recommendations for Step 4 self-labeling

Ordered by expected impact on Spec §7 gates:

1. **Prioritize overhang and roof footage.** The §5.2 volume targets
   (35 % overhang, 10 % roof) exist because the public-only baseline
   will be weakest there. Sample frames from CC-BY / CC-BY-SA video
   first; do not touch Kinetics-700 or ActivityNet (both
   `DO_NOT_USE`).
2. **Build the hard-moves slice before volume scales.** Spec §7 gate
   1b requires ≥ 100 labeled frames per category (heel hook, toe
   hook, drop knee, flag, mid-dyno, inverted). Gate this labeling
   ahead of generic frames so the hard-moves metric can actually be
   measured on the first post-self-label run.
3. **Add demographic + skin-tone metadata to the labeling schema now.**
   Without it, Spec §7 gate 7 stays `NOT EVALUATED` forever. Adding
   it after volume scales will require re-labeling.
4. **Stand up the two-annotator Cohen's κ ≥ 0.85 pipeline (§5.3)**
   before the test set is declared usable for gating. Gate metrics
   from a single annotator are not credible, regardless of numeric
   value.
5. **Per-video CC manifests under `data/manifests/self-labeled/<videoId>.yaml`.**
   No wildcard "CC YouTube" or "CC Vimeo" approvals. Strip BY-NC and
   BY-ND at ingest via `dataset_sanity.py`. Decide the BY-SA viral-
   copyleft policy *before* admitting any BY-SA video.
6. **Re-visit remaining `UNKNOWN_LICENSE` Tier-A sources** (AIST++
   video layer). Each is either promoted to `APPROVED_FOR_BASELINE`
   with a human signature or demoted to `RESEARCH_ONLY` /
   `DO_NOT_USE`. A source that stays `UNKNOWN_LICENSE` is functionally
   `DO_NOT_USE`. **Status as of 2026-04-26:**
   - CIMI4D and ClimbingCap / AscendMotion verified `RESEARCH_ONLY`
     (LiDAR Human Motion project license — no commercial training, no
     redistribution). Excluded from the shipping training set; may be
     used only for a non-shipped research baseline.
   - "The Way Up" (Zenodo 15196867) verified **CC-BY-4.0**. Cleared
     for Step-4 self-labeling as a *video* source (22 videos, no
     pose labels shipped). A human must still author the per-source
     manifest, fill `contentHash` (SHA-256 of the 20.9 GB
     `dataset.zip`; the record publishes MD5
     `a46cbca826a7f28ab591a4900ce5a1c9`, so the SHA must be computed
     locally after download), and sign `license.verifiedBy` /
     `license.verifiedAt` before ingestion.
7. **Reconcile the two dataset YAMLs** before Step 4. Pick either
   `datasets/climbing-pose/climbing-pose.yaml` or
   `scripts/training/climbing_pose.yaml`; deprecate the other. Two
   data layouts guarantee that one will drift.
8. **`contentHash` automation.** A `scripts/training/hash_manifests.py`
   that refuses to overwrite a real hash and writes the placeholder →
   real transition in a single commit closes the "agent silently
   ships zeros" failure mode.

### 9.3 Self-labeling quality guardrails (for Step 4 itself)

Once the above is cleared and Step 4 begins:

- Use the trained public-only model to *propose* labels; never commit
  unreviewed self-labels.
- Sample-audit ≥ 10 % of auto-generated labels per batch with a
  second annotator. Compute Cohen's κ; reject batches with κ < 0.85.
- Hold out the VAF 41-frame set and any Step-4 CC-video frames from
  the training set. They belong only in `val/` or `test/`.
- Record the *input* model's commit hash and this card's tag on every
  auto-labeled frame, so label provenance is traceable when the
  public-only baseline is eventually retrained on better data.
- Do not use auto-labels for the hard-moves slice. Those must be
  human-labeled end-to-end to defend Spec §7 gate 1b.

---

## 10. Licensing of this (non-existent) model

- Upstream architecture: Ultralytics YOLO11 is **AGPL-3.0**. Any
  future shipped weights inherit the Ultralytics licensing decision;
  legal sign-off and license option (weights-only vs enterprise) must
  be recorded on the first card that lists real weights. Not this one.
- Training data: per §3. The two cleared sources are CC BY 4.0;
  attribution block is reproduced there.
- This card documents a run that produced no weights and no exported
  artifact. There is nothing here to license to end users.

---

## 11. Deployment

**Not deployed. Will not be deployed in this state.**

- `modules/climbing-pose/ios/weights/`: no `climber-yolo11n-baseline-public.mlpackage`.
- `modules/climbing-pose/android/weights/`: no `.tflite`.
- `EXPO_PUBLIC_ANALYSIS_POSE_BACKEND`: must remain on the Apple
  Vision / MoveNet backend. Flipping it to `yolo` is not possible —
  there is no yolo artifact to flip to.

---

## 12. Change log

| Date | Change |
| ---- | ------ |
| 2026-04-24 | Created baseline model card. **No training ran.** All metrics "not measured", all Spec §7 gates "NOT EVALUATED". Documented the exact upstream blockers and the Step-4 recommendations. This card must be rewritten in place the first time a real run produces `runs/climbing-pose/baseline-public/results.csv`. |
| 2026-04-26 | Updated §3 and §9.2 to reflect verified license status: CIMI4D and ClimbingCap / AscendMotion confirmed `RESEARCH_ONLY` against the LiDAR Human Motion project license (no commercial training, no redistribution). Both are now excluded from the shipping training set. No retrain occurred; metrics remain unmeasured. |
| 2026-04-26 | Verified "The Way Up" (Zenodo record 15196867, DOI 10.5281/zenodo.15196867) is **CC-BY-4.0**. 22 annotated climbing videos, 20.9 GB single `dataset.zip`, MD5 `a46cbca826a7f28ab591a4900ce5a1c9`, published 2025-04-12 by Maschek + Schedl (University of Applied Sciences Upper Austria). Promoted from `UNKNOWN_LICENSE` to Step-4 self-labeling source (videos only — no pose labels shipped). Per-source manifest sign-off and SHA-256 still pending; no ingestion. |

---

*Honest summary for a quick reader: the first public-only baseline
was blocked before training by an unsigned license gate and an empty
dataset directory. No weights. No metrics. No pass/fail for any
shipping gate. The pipeline's refusal path fired correctly — that is
the only thing this attempt validated. Fix the data layer per §9.1,
re-run, and overwrite this card with real numbers. Until then, do not
use or cite this "model".*
