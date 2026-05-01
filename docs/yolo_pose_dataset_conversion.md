# YOLO-Pose dataset conversion — baseline run

**Agent:** Dataset Converter (Agent 3)
**Date:** 2026-04-24
**Upstream:**
- `docs/yolo_pose_dataset_candidates.md` (scout, Agent 1)
- `data/manifests/source_review.md` (license audit, Agent 2)
- `data/manifests/public_baseline_sources.yaml` (audit roll-up, Agent 2)
- `docs/yolo-pose-migration-spec.md` §5 "Training data" and §5.1 "First public-only baseline"

**What this doc is:** a truthful record of what the dataset-converter
agent did and — more importantly — did **not** do to prepare the
Ultralytics YOLO-Pose baseline dataset. It exists so that the next
human (or agent) can pick up exactly where this left off without
re-doing the audit or accidentally tripping the license gate.

## TL;DR

- Scaffolded `datasets/climbing-pose/` with the Ultralytics-style
  `images/{train,val,test}` + `labels/{train,val,test}` folder layout
  and a `climbing-pose.yaml` using the project's 17-COCO `kpt_shape`,
  `flip_idx`, and single `climber` class.
- **No frames or labels were downloaded or written into `datasets/`.**
  The two `APPROVED_FOR_BASELINE` sources have unsigned manifests
  (`license.verifiedBy: null`), and the COCO audit explicitly forbids
  checking raw frames into this repo. `dataset_sanity.py` is the gate;
  it correctly refuses the current stubs.
- Drafted **unsigned** per-source manifest stubs:
  - `data/manifests/coco-pose-2017.yaml`
  - `data/manifests/roboflow-vaf-bouldering-poses.yaml`
- Added `scripts/training/convert_vaf_to_coco17.py`, a strict (no-silent-fixes)
  converter from the Roboflow VAF export to YOLO-Pose labels in 17-COCO
  order. A human must supply an explicit keypoint-mapping JSON; the
  script refuses to guess.
- Ran `python scripts/training/dataset_sanity.py --root data` — it
  reports `FAIL (14 error(s))`, which is the correct state until a
  human signs the manifests.

## Sources used

| # | Source | Status in audit | Used as | Actual files ingested |
|---|---|---|---|---|
| 1 | COCO Keypoints 2017 / COCO-Pose | APPROVED_FOR_BASELINE (license.verifiedBy: null) | pretrain / warmstart, intended `train/` + `val/` | **none** — not downloaded |
| 2 | VAF Bouldering Poses (Roboflow) | APPROVED_FOR_BASELINE (license.verifiedBy: null) | climbing-slice sanity eval, intended `test/` | **none** — not downloaded |

Everything else in `data/manifests/public_baseline_sources.yaml` was
left alone. Specifically **not used** in this run:

- `aistpp`, `cimi4d`, `climbingcap-ascendmotion`,
  `the-way-up-zenodo-15196867`, `crowdpose`, `penn-action`,
  `roboflow-climbing-holds-and-volumes-blackcreed`,
  `roboflow-hold-detectors-misc` — all `UNKNOWN_LICENSE`.
- `posetrack21`, `youtube-cc-climbing`, `vimeo-cc-climbing`,
  `wikimedia-commons-climbing` — all `NEEDS_PERMISSION`.
- `mpii-human-pose` — `RESEARCH_ONLY`; unsafe for a shipping model.
- `kinetics-700`, `activitynet` — `DO_NOT_USE`.

## Files created or modified

New:
- `datasets/climbing-pose/climbing-pose.yaml` — Ultralytics dataset
  config: `kpt_shape: [17, 3]`, `flip_idx:
  [0,2,1,4,3,6,5,8,7,10,9,12,11,14,13,16,15]`, `names: {0: climber}`.
- `datasets/climbing-pose/README.md` — explains the layout, the 56-field
  label line format, and the "populate locally, never commit frames"
  rule.
- `datasets/climbing-pose/images/{train,val,test}/.gitkeep` and
  `datasets/climbing-pose/labels/{train,val,test}/.gitkeep` — preserve
  empty dirs in git.
- `data/manifests/coco-pose-2017.yaml` — unsigned per-source manifest.
- `data/manifests/roboflow-vaf-bouldering-poses.yaml` — unsigned
  per-source manifest.
- `scripts/training/convert_vaf_to_coco17.py` — strict Roboflow → 17-COCO
  converter; refuses to silently guess the keypoint mapping.

Modified:
- `.gitignore` — ignore actual frames/labels under
  `datasets/climbing-pose/images/` and `datasets/climbing-pose/labels/`,
  but keep `.gitkeep` markers and the config/README tracked.

## Why nothing was actually downloaded

Every one of these is a hard stop, not a nice-to-have:

1. **License gate not yet signed.** `data/manifests/coco-pose-2017.yaml`
   and `data/manifests/roboflow-vaf-bouldering-poses.yaml` have
   `license.verifiedBy: null` and `license.verifiedAt: null`.
   `dataset_sanity.py` and the audit brief are explicit that the
   signer must be *a real human name* — not `"claude"`, not
   `"agent-3"`, not empty. Signing them from an agent would defeat the
   purpose of the gate.
2. **COCO audit forbids in-repo frame redistribution.**
   `data/manifests/source_review.md` §1 says: *"Do not commit the raw
   image frames into this repo; reference them via DVC or the
   Ultralytics download script so the Flickr-layer license is not
   transitively re-licensed."* The right home for COCO frames is the
   training box's local disk, under DVC, fetched by
   `ultralytics.utils.downloads.download` at training time.
3. **VAF license needs a screenshot first.** Source review §2:
   *"Open the project page and screenshot the license tag into
   `data/manifests/attribution/` before signing, because Roboflow
   license tags are per-project and can change without a visible
   history."* That screenshot is part of the audit trail; an agent
   cannot produce it.
4. **VAF keypoint order to COCO-17 is not verified.** The scout and
   Agent 2 both flagged that Roboflow ships VAF in a "roboflow-native"
   keypoint order. Silently assuming it matches COCO-17 would be
   exactly the "silently fix bad labels" failure mode this process
   exists to prevent. The converter (`convert_vaf_to_coco17.py`)
   therefore demands the mapping as an explicit JSON file.
5. **Local environment can't run the full pipeline.** `ultralytics`
   and `opencv-python` are not installed in this repo's Python; those
   are training-box dependencies per `scripts/training/requirements.txt`.
   Even if the license gate were clear, downloading would not fit on
   this host.

## Repro: how a human unblocks and populates the dataset

Do these in order. Steps 1–3 are the license / audit work that
unblocks ingestion; steps 4–7 are the actual ingestion.

1. **Sign COCO-Pose manifest.**
   - Re-read https://cocodataset.org/#termsofuse.
   - Fill `license.verifiedBy` (your real name) and `license.verifiedAt`
     (ISO date) in `data/manifests/coco-pose-2017.yaml`.
2. **Sign VAF Bouldering Poses manifest.**
   - Open https://universe.roboflow.com/vaf/bouldering-poses.
   - Screenshot the CC-BY-4.0 tag into
     `data/manifests/attribution/roboflow-vaf-bouldering-poses.png`.
   - Record the exact source keypoint order into a mapping JSON at
     e.g. `data/manifests/attribution/vaf_to_coco17.json`:
     ```json
     {
       "vaf_keypoint_order": ["nose", "left_eye", "right_eye", "..."],
       "vaf_to_coco17": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
     }
     ```
     If the Roboflow project uses a different keypoint set, document
     it in `license.notes` of the manifest and adjust
     `vaf_to_coco17` accordingly.
   - Fill `license.verifiedBy` and `license.verifiedAt` in
     `data/manifests/roboflow-vaf-bouldering-poses.yaml`.
3. **Clean up the audit roll-up file.** `dataset_sanity.py` currently
   fails on `data/manifests/public_baseline_sources.yaml` because it
   is a roll-up, not a schema-valid per-source manifest. Either move
   it out of `data/manifests/` (e.g. to `docs/`), or teach
   `dataset_sanity.py` to skip roll-up files via a file-name
   convention. This was introduced by the audit (Agent 2) and is
   outside the converter's scope; noting it here so it isn't a
   surprise.
4. **Fetch COCO-Pose on the training box** (do NOT do this on a dev
   laptop and commit the result):
   ```bash
   cd scripts/training
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   python - <<'PY'
   from ultralytics.utils.downloads import download
   from pathlib import Path
   # Pull train2017 / val2017 images and person_keypoints annotations
   # into datasets/climbing-pose/. Cross-reference the paths that
   # coco-pose.yaml upstream expects; link/copy into images/train,
   # images/val, labels/train, labels/val accordingly.
   PY
   ```
   After fetching, compute the tarball hash and paste it into
   `contentHash` of `data/manifests/coco-pose-2017.yaml`:
   ```bash
   shasum -a 256 /path/to/coco-pose-download.tar | awk '{print "sha256:" $1}'
   ```
   And update `frameCount` to the real count of images under
   `images/train/` + `images/val/`.
5. **Export VAF Bouldering Poses from Roboflow** in "YOLOv8 Pose"
   format. Unzip to e.g. `~/roboflow/vaf-bouldering-poses-v1/` so the
   layout is `~/roboflow/vaf-bouldering-poses-v1/test/images/*.jpg`
   and `~/roboflow/vaf-bouldering-poses-v1/test/labels/*.txt`.
6. **Run the converter** (refuses to silently remap keypoints):
   ```bash
   python scripts/training/convert_vaf_to_coco17.py \
     --export-root ~/roboflow/vaf-bouldering-poses-v1 \
     --dataset-root datasets/climbing-pose \
     --mapping data/manifests/attribution/vaf_to_coco17.json \
     --split test
   ```
   Compute the export-zip hash and paste it into `contentHash` of
   `data/manifests/roboflow-vaf-bouldering-poses.yaml`.
7. **Re-run sanity.** Expected state:
   ```bash
   python scripts/training/dataset_sanity.py --root data --strict
   # -> dataset_sanity: OK (N warning(s))
   ```
   Training is only safe after this exits 0. If it is not yet 0, fix
   the root cause; do not bypass sanity.

## Known problems / skipped files

- **Roll-up manifest.** `data/manifests/public_baseline_sources.yaml`
  is an audit roll-up drafted by Agent 2. `dataset_sanity.py`
  treats everything under `data/manifests/` as a per-source manifest
  and therefore reports schema violations against the roll-up. This is
  a pre-existing discrepancy between the audit draft and the schema;
  see step 3 above for the fix options. Not resolved here.
- **No duplicate-hash dedupe possible yet.** Both unsigned manifests
  carry the same placeholder `contentHash` (64 zeroes). `dataset_sanity.py`
  flags the duplicate, which is intentional — it blocks the signer
  from shipping without real hashes.
- **15k-frame floor unmet.** Spec §5.1 requires ≥15k labeled frames
  from licensed sources to declare a "real baseline". COCO-Pose clears
  that floor on its own (~250k person instances across train2017),
  but only after step 4 above; until then the sanity report warns
  `"only 42 labeled frames"`.
- **No training initiated.** Per the task rules.

## Sanity-check output at handoff

```
ERROR data/manifests/coco-pose-2017.yaml: schema violation: None is not of type 'string'
ERROR data/manifests/coco-pose-2017.yaml: license.verifiedBy + license.verifiedAt required — no manifest passes without human sign-off
ERROR data/manifests/public_baseline_sources.yaml: schema violation: 'sourceId' is a required property
... (additional schema violations against the roll-up file — see Known problems) ...
ERROR data/manifests/roboflow-vaf-bouldering-poses.yaml: schema violation: None is not of type 'string'
ERROR data/manifests/roboflow-vaf-bouldering-poses.yaml: license.verifiedBy + license.verifiedAt required — no manifest passes without human sign-off
ERROR manifests: duplicate contentHash sha256:0000...0000 across 2 manifests — dedupe before training
WARN  data/splits/{train,val,test}.txt: split file missing — run extract_frames.py
WARN  aggregate: only 42 labeled frames — spec §5.1 requires ≥15k from licensed sources

dataset_sanity: FAIL (14 error(s))
```

This is the intended blocked state. Training must not proceed until a
named human signs both manifests, fills real content hashes, and
`dataset_sanity` exits 0.

*End of conversion notes. Nothing downloaded. Nothing trained. Two
sources drafted; both waiting on a human signature.*
