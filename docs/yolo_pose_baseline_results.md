# YOLO-Pose baseline results — public-only run

**Agent:** Training Runner (Agent 4)
**Date:** 2026-04-24
**Spec reference:** [`docs/yolo-pose-migration-spec.md`](./yolo-pose-migration-spec.md) §5.1, §5.4, §6, §7
**Upstream handoff:** [`docs/yolo_pose_dataset_conversion.md`](./yolo_pose_dataset_conversion.md) (Agent 3)
**Model card stub:** [`docs/model_cards/yolo-pose-v1.md`](./model_cards/yolo-pose-v1.md)

> **Status: NOT TRAINED.** This run was blocked at the dataset gate.
> No weights were produced, no metrics were collected, and per task
> rules metrics were **not** fabricated. This document is the honest
> record of what was attempted, why it could not proceed, and the
> exact commands a human must run to unblock the real training.

---

## 1. TL;DR

- Dataset at `datasets/climbing-pose/images/{train,val,test}` and
  `datasets/climbing-pose/labels/{train,val,test}` is **empty** (only
  `.gitkeep` markers). No frames were downloaded by Agent 3 because the
  license gate is unsigned.
- `python scripts/training/dataset_sanity.py --root data` exits
  **`FAIL (14 errors)` / exit 1** on the current tree.
- Per [`scripts/training/train.py`](../scripts/training/train.py)
  `run_sanity()`, training **refuses to start** when sanity fails —
  and that is the correct behaviour.
- Both `yolo`/`ultralytics` and `torch` are **not installed** on this
  host; the project's `scripts/training/requirements.txt` pins
  `torch==2.4.1` which has no prebuilt wheel for the Python 3.14 on
  this box.
- Every Spec §7 evaluation gate therefore reports **"Not evaluated —
  no trained weights"**. No gate is recorded as passed or failed —
  reporting either would be a fabrication.

This is the intended state for Step 3 of the rollout plan ("expected
to fail, which is fine; establishes baseline"). The pipeline is proved
only insofar as the *refusal-to-train gate* fires correctly. The
*training gate* itself is still unvalidated because no ingested data
has reached it.

---

## 2. Commands attempted / what the human must run

### 2.1 Command prescribed by the task

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

**Not executed.** Blocked by the preconditions in §3.

Note: this CLI form points at
`datasets/climbing-pose/climbing-pose.yaml` (the empty-scaffold
Ultralytics config added by Agent 3), not the project's own
`scripts/training/climbing_pose.yaml` (the DVC-backed layout used by
`scripts/training/train.py`). Both paths exist, both are valid
Ultralytics configs, and they point at **different on-disk layouts**
— see §7 for the reconciliation recommendation.

### 2.2 Validation command (also not run)

```bash
yolo pose val \
  model=runs/climbing-pose/baseline-public/weights/best.pt \
  data=datasets/climbing-pose/climbing-pose.yaml
```

### 2.3 What was actually run on this host

```bash
# Verify ultralytics / torch availability
python3 -c "import ultralytics, torch"
# -> ModuleNotFoundError: No module named 'ultralytics'

# Count frames and labels in the scaffold
find datasets/climbing-pose/images -type f
# -> only .gitkeep files in train/val/test

# Run the gate
python scripts/training/dataset_sanity.py --root data
# -> dataset_sanity: FAIL (14 error(s))
# -> exit 1
```

---

## 3. Why training could not run (every one is a hard block)

1. **Dataset is empty.** `images/{train,val,test}` and
   `labels/{train,val,test}` contain zero real files — only
   `.gitkeep` markers that were deliberately committed so git retains
   the directories. Ultralytics would fail with
   `WARNING: No labels found in <path>` and immediately abort.
2. **License manifests are unsigned.**
   `data/manifests/coco-pose-2017.yaml` and
   `data/manifests/roboflow-vaf-bouldering-poses.yaml` both have
   `license.verifiedBy: null` and `license.verifiedAt: null`. Per the
   audit rules ([`data/manifests/source_review.md`](../data/manifests/source_review.md))
   the signer must be *a real human name* — not `"claude"`, not
   `"agent-4"`. An agent signing the manifest would defeat the gate
   it exists to enforce.
3. **`contentHash` still placeholder.** Both manifests carry
   `sha256:0000...0000`. `dataset_sanity.py` flags the duplicate and
   blocks ingestion until a real tarball / export zip has been fetched
   and hashed on the training box.
4. **VAF → COCO-17 keypoint mapping not confirmed.** Roboflow VAF
   ships keypoints in a non-COCO order.
   `scripts/training/convert_vaf_to_coco17.py` refuses to guess the
   mapping; it demands an explicit
   `data/manifests/attribution/vaf_to_coco17.json` which does not
   exist yet.
5. **COCO frames must not land in this repo.** The audit explicitly
   forbids committing raw Flickr-origin frames. Running
   `ultralytics` auto-download against `datasets/climbing-pose/` on a
   dev machine would stage ~250k frames where the audit forbids them,
   even if `.gitignore` would drop them at commit time.
6. **Training env unavailable on this host.** `ultralytics==8.3.40`,
   `torch==2.4.1`, `torchvision==0.19.1`, `opencv-python-headless`,
   `tensorflow==2.17.0`, `coremltools==8.0`, `dvc` — none installed
   on this macOS 26.3.1 arm64 laptop. The only Python available is
   3.14, which has no prebuilt wheels for `torch==2.4.1`. This is a
   dev box, not the training box.
7. **Sanity gate already refuses.**
   `python scripts/training/dataset_sanity.py --root data` returns
   exit 1, and `scripts/training/train.py::run_sanity` hard-aborts on
   non-zero exit. Bypassing this with `--skip-sanity` in CI (or from
   an agent) is explicitly flagged in the script as "dev only; never
   in CI".

---

## 4. Current dataset state

### 4.1 On-disk counts

| Split | `images/` count | `labels/` count | Source (per Spec §5.1, §5.3) |
| ----- | --------------- | --------------- | ----------------------------- |
| train | 0 | 0 | COCO-Pose 2017 `person_keypoints_train2017` (planned) |
| val   | 0 | 0 | COCO-Pose 2017 `person_keypoints_val2017` (planned) |
| test  | 0 | 0 | Roboflow VAF Bouldering Poses, ~41 frames (planned) |

`.gitkeep` markers only.

### 4.2 Planned aggregate (not yet on disk)

Spec §5.1 target: **≥ 15 k labeled climber frames** from licensed
sources before the baseline can be declared "real". The planned
sources cover this on paper (COCO-Pose alone ~250k person instances),
but nothing has been fetched.

### 4.3 Sanity output (verbatim, 2026-04-24)

```
ERROR data/manifests/coco-pose-2017.yaml: schema violation: None is not of type 'string'
ERROR data/manifests/coco-pose-2017.yaml: schema violation: None is not of type 'string'
ERROR data/manifests/coco-pose-2017.yaml: license.verifiedBy + license.verifiedAt required — no manifest passes without human sign-off
ERROR data/manifests/public_baseline_sources.yaml: schema violation: 'sourceId' is a required property
ERROR data/manifests/public_baseline_sources.yaml: schema violation: 'sourceKind' is a required property
ERROR data/manifests/public_baseline_sources.yaml: schema violation: 'license' is a required property
ERROR data/manifests/public_baseline_sources.yaml: schema violation: 'frameCount' is a required property
ERROR data/manifests/public_baseline_sources.yaml: schema violation: 'climbingFraction' is a required property
ERROR data/manifests/public_baseline_sources.yaml: schema violation: 'contentHash' is a required property
ERROR data/manifests/public_baseline_sources.yaml: license.verifiedBy + license.verifiedAt required — no manifest passes without human sign-off
ERROR data/manifests/roboflow-vaf-bouldering-poses.yaml: schema violation: None is not of type 'string'
ERROR data/manifests/roboflow-vaf-bouldering-poses.yaml: schema violation: None is not of type 'string'
ERROR data/manifests/roboflow-vaf-bouldering-poses.yaml: license.verifiedBy + license.verifiedAt required — no manifest passes without human sign-off
ERROR manifests: duplicate contentHash sha256:0000000000000000000000000000000000000000000000000000000000000000 across 2 manifests — dedupe before training
WARN  data/splits/train.txt: split file missing — run extract_frames.py
WARN  data/splits/val.txt: split file missing — run extract_frames.py
WARN  data/splits/test.txt: split file missing — run extract_frames.py
WARN  aggregate: only 42 labeled frames — spec §5.1 requires ≥15k from licensed sources

dataset_sanity: FAIL (14 error(s))
```

---

## 5. Machine / environment

Machine (dev laptop — **NOT a training box**):

| Field | Value |
| ----- | ----- |
| OS | macOS 26.3.1 (25D771280a) |
| CPU arch | arm64 (Apple Silicon) |
| GPU | Integrated Apple GPU (no CUDA) |
| Python (system) | 3.9.6 (`/usr/bin/python3`) |
| Python (latest available) | 3.14.2 (`/opt/homebrew/bin/python3.14`) |
| `ultralytics` | **not installed** |
| `torch` / `torchvision` | **not installed** |
| `yolo` CLI | **not on PATH** |
| `dvc` | **not installed** |

The training box referenced in `docs/yolo-pose-migration-spec.md` §6.1
(CUDA 12 / A100-class / PyTorch 2.4) does not exist locally. Spec §6.1
also notes that MPS (Apple Silicon) training works "as of Ultralytics
8.3+" but is slower — not used here because training itself was
blocked upstream.

---

## 6. Metrics

| Metric | Spec §1.3 target | Spec §7 gate | Measured value | Status |
| ------ | ---------------- | ------------- | -------------- | ------ |
| mAP@0.50:0.95 (pose, climber-only) | ≥ 0.65 | — | **not measured** | Not evaluated — no trained weights |
| OKS (climber-only, test set) | ≥ 0.78 | ≥ 0.78 overall | **not measured** | Not evaluated — no test set ingested |
| OKS on hard-moves slice | — | ≥ 0.65 | **not measured** | Not evaluated — hard-moves slice not built |
| Per-keypoint confidence ≥ 0.5 on reach/dyno | — | ≥ 80 % of frames | **not measured** | Not evaluated — no reach/dyno subset |
| iPhone 15 latency (15 s clip) | — | ≤ 6 s end-to-end | **not measured** | Not evaluated — no exported artifact |
| Exported model size | — | ≤ 15 MB | **not measured** | Not evaluated — no export |
| Scoring regression (8 categories, ±5 of Vision baseline) | — | all 8 within ±5 | **not measured** | Not evaluated — no runtime artifact |
| `liftConfidence` | — | ≥ 0.7 | **not measured** | Not evaluated — no runtime artifact |
| Demographic OKS gap | — | < 0.05 | **not measured** | Not evaluated — no eval set |

**No metric in this table was estimated, extrapolated, or
back-of-the-envelope'd.** Every "not measured" is literal: the run did
not produce a weights file and the eval set is not ingested, so no
pose predictions exist to compute these on.

---

## 7. Spec §7 gate evaluation

Each gate is reported as **PASS / FAIL / NOT EVALUATED**. Reporting
PASS or FAIL without a measurement would be a fabrication.

| # | Gate (Spec §7) | Status |
| - | -------------- | ------ |
| 1 | Test-set OKS ≥ 0.78 overall and ≥ 0.65 on hard-moves slice | **NOT EVALUATED** — no trained model, no test set ingested |
| 2 | Per-keypoint confidence ≥ 0.5 on ≥ 80 % of reach/dyno frames | **NOT EVALUATED** — no trained model, no reach/dyno subset built |
| 3 | iPhone 15 latency ≤ 6 s end-to-end for a 15 s clip | **NOT EVALUATED** — no Core ML export |
| 4 | Model file ≤ 15 MB after quantization | **NOT EVALUATED** — no export |
| 5 | No regression on scoring — 8 category scores within ±5 of the Apple-Vision baseline on 10 seeded sessions | **NOT EVALUATED** — no runtime artifact to feed through `analyzeSession` |
| 6 | `liftConfidence` ≥ 0.7 on validation sessions | **NOT EVALUATED** — no runtime artifact |
| 7 | Keypoint OKS gap between demographic slices < 0.05 | **NOT EVALUATED** — no eval set, no demographic slice labels |

Overall: **blocked at the data-ingest gate — no Spec §7 gate has been
measured on this run.** The Spec §10 rollout plan calls out exactly
this: Step 3 is *expected to fail*, and the failure mode here is the
data layer, not the model.

---

## 8. Qualitative failure cases

None. No predictions were produced (see §6). The `runs/climbing-pose/`
directory does not exist; there are no inference images, no
val-batch mosaics, and no failure samples to inspect.

---

## 9. Manual unblock — exact commands for a human

Run these in order on a real training box (Linux + NVIDIA or an Apple
Silicon workstation with enough headroom; not the dev laptop). Every
step maps to a blocker in §3. Nothing here is safe to delegate to an
agent.

### 9.1 Sign the license manifests (human, not agent)

```bash
# 1. Read https://cocodataset.org/#termsofuse and fill:
#    data/manifests/coco-pose-2017.yaml
#      license.verifiedBy: "<your real name>"
#      license.verifiedAt: "2026-04-24"   # ISO date
#
# 2. Open https://universe.roboflow.com/vaf/bouldering-poses and:
#    a) Screenshot the CC-BY-4.0 tag into
#       data/manifests/attribution/roboflow-vaf-bouldering-poses.png
#    b) Record the keypoint order into
#       data/manifests/attribution/vaf_to_coco17.json
#       (see docs/yolo_pose_dataset_conversion.md §Repro step 2 for
#       the exact schema).
#    c) Fill license.verifiedBy / license.verifiedAt in
#       data/manifests/roboflow-vaf-bouldering-poses.yaml.
#
# 3. Move the Agent-2 roll-up out of data/manifests/ (it is not a
#    per-source manifest and the sanity script rejects it):
mv data/manifests/public_baseline_sources.yaml docs/public_baseline_sources_audit.yaml
```

### 9.2 Build the training environment

```bash
cd scripts/training
python3.11 -m venv .venv           # pin to 3.11, matches torch 2.4.1 wheels
source .venv/bin/activate
pip install -r requirements.txt
```

### 9.3 Fetch COCO-Pose onto local disk (NOT committed)

```bash
python - <<'PY'
from ultralytics.utils.downloads import download
from pathlib import Path
# Pull train2017 + val2017 images and person_keypoints annotations.
# Target: datasets/climbing-pose/images/{train,val} +
#         datasets/climbing-pose/labels/{train,val}
# See docs/yolo_pose_dataset_conversion.md §Repro step 4 for the exact
# link/copy layout — Ultralytics' default coco-pose.yaml expects a
# slightly different tree than our repo layout.
PY

# Compute the tarball hash and paste into contentHash of
# data/manifests/coco-pose-2017.yaml:
shasum -a 256 /path/to/coco-pose-download.tar | awk '{print "sha256:" $1}'
```

### 9.4 Export + convert VAF (human confirms keypoint mapping)

```bash
# Export VAF Bouldering Poses from Roboflow in "YOLOv8 Pose" format,
# unzip under ~/roboflow/vaf-bouldering-poses-v1/.
python scripts/training/convert_vaf_to_coco17.py \
  --export-root ~/roboflow/vaf-bouldering-poses-v1 \
  --dataset-root datasets/climbing-pose \
  --mapping data/manifests/attribution/vaf_to_coco17.json \
  --split test

# Record the export-zip hash into contentHash of
# data/manifests/roboflow-vaf-bouldering-poses.yaml.
```

### 9.5 Prove the data layer

```bash
python scripts/training/dataset_sanity.py --root data --strict
# Must exit 0 before training. If it does not, FIX the root cause;
# do NOT invoke train.py with --skip-sanity.
```

### 9.6 Run the baseline

Two CLI forms exist; the task brief uses form A, `train.py` uses
form B. Pick one and commit to the path.

**Form A — task-brief command (points at the `datasets/…` yaml):**

```bash
yolo pose train \
  model=yolo11n-pose.pt \
  data=datasets/climbing-pose/climbing-pose.yaml \
  epochs=50 \
  imgsz=640 \
  batch=16 \
  project=runs/climbing-pose \
  name=baseline-public

yolo pose val \
  model=runs/climbing-pose/baseline-public/weights/best.pt \
  data=datasets/climbing-pose/climbing-pose.yaml
```

**Form B — project's curriculum (3-phase, DVC-backed):**

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

Form B runs a single phase (Phase A) with strict sanity — the correct
choice for a truthful public-only baseline. Phases B/C add
oversampling + high-res fine-tune and should only run once the
self-labeled set (§5.2) exists.

### 9.7 Export metrics + samples

```bash
# After either form, pose val produces:
#   runs/climbing-pose/baseline-public/results.csv
#   runs/climbing-pose/baseline-public/weights/{best,last}.pt
#   runs/climbing-pose/baseline-public/val_batch*_pred.jpg
#
# Copy the numeric row of results.csv and the per-keypoint OKS from
# the val log into §6 and §7 of this document, overwriting the
# "not measured" cells with real values.
```

---

## 10. Recommended dataset improvements (for the next iteration)

Ordered by impact on the Spec §7 gates:

1. **Close the "climbing-specific frames" floor (§5.1 target ≥ 15 k).**
   COCO-Pose is a general-person warmstart; it has essentially no
   climbing geometry (hands above shoulders on vertical surfaces,
   inverted torso, heel-hook hip rotation). Expect OKS on the hard-
   moves slice to be materially below 0.65 until self-labeled
   footage lands. The 41-frame VAF test set is *eval-only* — do not
   roll it into `train/`.
2. **Prioritize overhang / roof footage in self-labeling (§5.2).**
   The spec's volume targets are 35 % overhang + 10 % roof precisely
   because the baseline is known-weak there. The current 42-frame
   VAF sample is all-gym and mostly vertical; without roof frames
   the bias slice for wall-angle will fail even if the demographic
   slice passes.
3. **Stand up the hard-moves slice labeling (§7 gate 1b).** Without
   ≥ 100 frames per category (heel hook / toe hook / drop knee /
   flag / mid-dyno / inverted) the ≥ 0.65 hard-moves OKS gate cannot
   be measured, so it will stay `NOT EVALUATED`. Block self-labeling
   QA on this slice before generic frames.
4. **Two-annotator Cohen's κ ≥ 0.85 pipeline (§5.3).** Not yet
   implemented. The test set will be unsound for gating without it,
   even if counts are met.
5. **Demographic / skin-tone metadata (§7 gate 7).** Current manifests
   have no demographic fields. Bias slice can't be computed without
   them. Add to the per-frame labeling schema before volume scales,
   not after.
6. **Reconcile the two `*.yaml` configs.** Today
   `datasets/climbing-pose/climbing-pose.yaml` and
   `scripts/training/climbing_pose.yaml` describe *different* data
   layouts. Pick one (`train.py` prefers the latter; the
   task-brief CLI prefers the former). Recommend consolidating to
   the DVC-backed `scripts/training/climbing_pose.yaml` and
   deprecating the scaffold yaml once frames are ingested, so
   "where does training data live" has exactly one answer.
7. **Split file generation.** `data/splits/{train,val,test}.txt` are
   missing (sanity WARNs). `scripts/training/extract_frames.py` is
   the script of record; it has not been run. Add a CI gate that
   asserts splits exist before any `train.py` invocation.
8. **`contentHash` automation.** Both manifests still carry
   `sha256:0000...`. A short helper (e.g.
   `scripts/training/hash_manifests.py`) that refuses to overwrite a
   real hash and writes the placeholder → real hash transition in a
   single commit would close the "agent silently ships zeros"
   failure mode.

---

## 11. What this run *did* prove

Even though no weights were produced, the refusal path was exercised
end-to-end and behaved correctly:

- `dataset_sanity.py` detected all three expected unsigned-manifest
  errors, the duplicate placeholder hashes, missing split files, and
  the under-floor frame count — exit 1 as designed.
- `train.py::run_sanity` is wired to abort on that exit code (confirmed
  by reading the source at `scripts/training/train.py:35-42`).
- The dataset scaffold's `.gitkeep` layout survives a clean checkout —
  the `images/{train,val,test}` + `labels/{train,val,test}` tree is
  preserved in git without any frame content, matching the "never
  commit frames" rule from the audit.
- The `datasets/climbing-pose/climbing-pose.yaml` config is
  Ultralytics-loadable: `kpt_shape: [17, 3]`,
  `flip_idx: [0,2,1,4,3,6,5,8,7,10,9,12,11,14,13,16,15]`, single
  `climber` class — this matches `JOINT_NAMES` in
  `src/domain/models/pose.ts` so the runtime provider can consume the
  eventual exported artifact without a keypoint-remap shim.

Those are small but load-bearing invariants. The first time
`dataset_sanity` exits 0 *and* `yolo pose train` produces a
`results.csv`, this document should be rewritten in place — replacing
every "not measured" and "NOT EVALUATED" with real numbers — and the
Step 3 checkbox in `docs/yolo-pose-migration-spec.md` §1 can be
checked.

---

## 12. Files touched by this run

| Path | Action |
| ---- | ------ |
| `docs/yolo_pose_baseline_results.md` | **Created** (this file). |

Nothing else was modified. No app runtime code was touched (per task
rules). No weights, predictions, or metric artifacts were produced or
committed.

*End of baseline results. No training occurred; no metrics were
fabricated. Unblock the data layer first (§9), then run §9.6, then
overwrite §6 / §7 / §8 of this document with real measurements.*
