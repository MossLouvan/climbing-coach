# datasets/climbing-pose — baseline YOLO-Pose dataset layout

Ultralytics-style layout for the climbing YOLO-Pose v1 baseline.
Nothing in `images/` or `labels/` is committed to the repo — the two
sources cleared by the license audit (COCO-Pose 2017 and Roboflow VAF
Bouldering Poses) explicitly disallow in-repo redistribution of raw
frames. Populate locally on a training box.

## Layout

```
datasets/climbing-pose/
  climbing-pose.yaml      # Ultralytics dataset config (17-COCO, flip_idx, class 0 = climber)
  README.md               # this file
  images/
    train/   val/   test/ # JPEG/PNG frames, one per sample. EMPTY in repo.
  labels/
    train/   val/   test/ # YOLO-pose txt labels, one per image. EMPTY in repo.
```

Each label line has 1 class + 4 bbox + 17 keypoints × 3 = **56 fields**:

```
0  cx cy w h  kp0x kp0y v0  kp1x kp1y v1  ... kp16x kp16y v16
```

Bounding-box and keypoint coords are **normalized to [0, 1]** (image
width / height). Visibility: `0 = missing`, `1 = labeled but occluded`,
`2 = labeled and visible`. This matches `dataset_sanity.py`'s
`check_keypoints` parser.

## Populating locally (NOT in repo)

This is blocked on a human signing the per-source manifests. See
`docs/yolo_pose_dataset_conversion.md` for the full procedure. In short:

1. A named human fills `license.verifiedBy` + `license.verifiedAt` in
   `data/manifests/coco-pose-2017.yaml` and
   `data/manifests/roboflow-vaf-bouldering-poses.yaml` (and populates
   `contentHash` once the tarball/export is on disk).
2. On a training box, fetch COCO-Pose via the Ultralytics pipeline
   (`ultralytics.utils.downloads.download` from the `coco-pose.yaml`
   upstream config) into `images/train` + `labels/train` and
   `images/val` + `labels/val`.
3. Export VAF Bouldering Poses from Roboflow in "YOLOv8 Pose" format,
   drop the JPEGs into `images/test/` and run the
   `scripts/training/convert_vaf_to_coco17.py` converter to remap its
   native keypoints to the 17-COCO schema (see converter docstring;
   the mapping is not auto-detected — a human confirms it from the
   Roboflow project page).
4. Run `python scripts/training/dataset_sanity.py --root data` (and
   with `--strict` before training). It must exit 0 before `train.py`
   is invoked.

## Splits

- **train** — COCO-Pose 2017 `person_keypoints_train2017` frames.
- **val**   — COCO-Pose 2017 `person_keypoints_val2017` frames.
- **test**  — VAF Bouldering Poses (~41 images, climbing-slice sanity eval).

The ~41-image VAF set is **too small to train on**; it is the
climbing-specific eval slice. Do not stir it into `train/`.
