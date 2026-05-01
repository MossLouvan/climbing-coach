# Model card — climber-yolo11n-v1

**Status:** Template. Fill this in on the PR that promotes a trained
model to the `yolo` backend.

**Spec reference:** [`docs/yolo-pose-migration-spec.md`](../yolo-pose-migration-spec.md)
**Training scripts:** [`scripts/training/`](../../scripts/training/)

## Identity

| Field | Value |
| ----- | ----- |
| Model tag | `climber-yolo11n-v1` |
| Architecture | Ultralytics YOLO11n-Pose |
| Warmstart | `yolo11n-pose.pt` (COCO-Pose) |
| Run ID | _dataset@revN, code@commitN, configHash_ |
| Trained on | _host / GPU / wall time_ |
| Maintainer | _name_ |

## Data

| Dataset | Source | License | Frames | Notes |
| ------- | ------ | ------- | ------ | ----- |
| COCO-Pose 2017 | cocodataset.org | CC-BY-4.0 | _n_ | Warmstart only. |
| MPII climbing subset | _source_ | _spdx_ | _n_ | _n_ |
| Roboflow Universe — _project_ | _url_ | _spdx_ | _n_ | _n_ |
| Self-labeled CC climbing | YouTube (CC-BY) | CC-BY-4.0 | _n_ | 30% hand-labeled. |

Aggregate frames: _n_ train / _n_ val / _n_ test.
Hard-moves slice: heel hook _n_, toe hook _n_, drop knee _n_, flag _n_, mid-dyno _n_, inverted _n_.

## Metrics

Evaluated on the held-out test set _and_ on the exported .mlpackage /
.tflite directly. Numbers here are from the **exported** artifact.

| Metric | Value | Target (spec §1.3) |
| ------ | ----- | ------------------ |
| OKS (climber-only) | _n_ | ≥ 0.78 |
| mAP@0.50:0.95 (pose) | _n_ | ≥ 0.65 |
| Hard-moves frame accuracy | _n_ | ≥ 0.70 |
| % reach/dyno frames, all 17 kp confident | _n_ | ≥ 80 % |
| iPhone 15 per-frame inference | _n_ ms | ≤ ~7 ms |
| Android (Pixel 8) per-frame inference | _n_ ms | _informational_ |
| Bundled model size | _n_ MB | ≤ 15 MB |

Bias slice (|ΔOKS| must be < 0.05):

| Slice A | Slice B | |ΔOKS| |
| ------- | ------- | ----- |
| female climbers | male climbers | _n_ |
| darker skin tone | lighter skin tone | _n_ |
| overhang | vertical | _n_ |

## Integration regression

Replayed `analyzeSession()` against the same 10 seeded sessions on
both the previous provider and this one (spec §7):

| Category | Δ avg vs. baseline | within ±5 ? |
| -------- | ------------------ | ----------- |
| balance | _n_ | _y/n_ |
| hip_positioning | _n_ | _y/n_ |
| flagging | _n_ | _y/n_ |
| reach_efficiency | _n_ | _y/n_ |
| stability | _n_ | _y/n_ |
| dynamic_control | _n_ | _y/n_ |
| smoothness | _n_ | _y/n_ |
| route_adherence | _n_ | _y/n_ |

Mean `liftConfidence`: _n_ (must be ≥ 0.7).

## Known limitations

- _e.g. "low-light gym shots under 50 lux"_
- _e.g. "climbers < 130 cm not represented in training"_

## Licensing

- Upstream: Ultralytics YOLO11 under AGPL-3.0.
- This model ships to end users under _option 1 (weights-only)_ /
  _option 2 (enterprise license)_ — fill in after legal sign-off.
- Legal sign-off: _reviewer, date_.

## Deployment

- iOS: `modules/climbing-pose/ios/weights/climber-yolo11n-v1.mlpackage`
- Android: `modules/climbing-pose/android/weights/climber-yolo11n-v1.tflite`
- Rolled out behind `EXPO_PUBLIC_ANALYSIS_POSE_BACKEND`; default flipped
  to `yolo` at _date_.

## Change log

| Date | Change |
| ---- | ------ |
| _YYYY-MM-DD_ | Initial promotion. |
