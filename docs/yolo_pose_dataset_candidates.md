# YOLO-Pose Dataset Candidates

**Agent:** Dataset Scout (Agent 1)
**Date:** 2026-04-24 (revised 2026-04-26 with CIMI4D / LiDAR Human license verification)
**Scope:** Candidate sources for training a climbing-specific YOLO-Pose model using 17 COCO keypoints.
**Status:** Reconnaissance only — no downloads, no label work, no training. Licenses are not verified beyond what the source page states; each candidate must be reviewed for usability before ingestion.

## Legend

- **Type:** images / videos / 2D pose labels / 3D pose labels / bboxes / action-classification labels / hold-detection
- **Has keypoints?** whether keypoint annotations already ship with the dataset
- **KP format:** COCO-17, MPII-16, SMPL, H3.6M-17, none, etc.

---

## Tier A — Climbing-specific pose / motion datasets

> ⚠️ **License-blocked finding (verified 2026-04-26):** Both **CIMI4D** and
> **ClimbingCap / AscendMotion** are released under the LiDAR Human Motion
> project license at http://www.lidarhumanmotion.net/license/. That license
> **explicitly prohibits using the dataset to train methods/algorithms/
> neural networks for commercial use of any kind** and forbids
> redistribution. If our app is or will be commercial, neither dataset is
> usable for training the shipping model. They remain valid for *research-
> only* baselines, internal evaluation, and public-academic comparisons —
> but a separate, commercially-clean training set is required for the
> shipped weights.

| Name | URL | Type | Approx size | Has keypoints? | KP format | License (as stated) | Why it helps | Concerns |
|---|---|---|---|---|---|---|---|---|
| **CIMI4D** (CVPR 2023) | http://www.lidarhumanmotion.net/cimi4d/ · paper: https://arxiv.org/abs/2303.17948 · license: http://www.lidarhumanmotion.net/license/ | RGB videos + LiDAR + IMU + SMPL poses + scene meshes | ~180k frames · 12 actors · 13 walls · 42 sequences | Yes (body poses; SMPL-based) | SMPL parameters (not raw COCO-17); 2D projection requires conversion | **Research-only — commercial training prohibited; redistribution prohibited; one archive copy permitted; provided "AS IS" with no warranty.** | Only public dataset of annotated climbing motion with scene interaction; useful for *internal benchmarking* and *research-only baselines* | **Cannot be used to train the shipped (commercial) model.** SMPL→COCO-17 conversion required even for research use; back-facing climbers mean many 2D keypoints are occluded |
| **ClimbingCap / AscendMotion** (CVPR 2025) | http://www.lidarhumanmotion.net/climbingcap/ · paper: https://arxiv.org/abs/2503.21268 · license: http://www.lidarhumanmotion.net/license/ | RGB + LiDAR + IMU, multi-modal climbing motion | ~412k frames · 22 skilled climbers · 12 real-world walls · bouldering, speed, lead | Yes (claim: synchronized motion data) | Likely SMPL / 3D; verify 2D KP availability | **Same LiDAR Human Motion license as CIMI4D — non-commercial training only.** | Newer and larger superset of CIMI4D; covers three climbing disciplines we care about | **Same commercial-use ban as CIMI4D.** Treat as research-only; do not include frames or weights derived from it in the shipped artifact |
| **"The Way Up" — Hold Usage Detection** (CVPRW 2025) | Paper: https://arxiv.org/abs/2505.12854 · Data: https://zenodo.org/records/15196867 | Climbing videos + hold bboxes + hold-usage order/time labels | 22 videos · 10 participants · 2 routes · indoor wall | No pose labels shipped; the paper *uses* pose estimation to derive usage | n/a (bboxes of holds, not joints) | Zenodo record — check record page for CC license tag (most Zenodo climbing-research records use CC-BY 4.0; verify before ingestion) | Clean, recent, on Zenodo; videos are re-usable as frame source for pose pseudo-labeling — currently the most promising commercially-clean climbing-video source | Small (22 videos); pose labels must be generated ourselves; confirm Zenodo license tag before ingestion |

## Tier B — Roboflow Universe (climbing-adjacent)

| Name | URL | Type | Approx size | Has keypoints? | KP format | License | Why it helps | Concerns |
|---|---|---|---|---|---|---|---|---|
| **Bouldering Poses** (VAF) | https://universe.roboflow.com/vaf/bouldering-poses | Keypoint detection · single class "Climber" | ~41 images (very small) | Yes | Roboflow keypoint schema — verify it maps to COCO-17 | CC BY 4.0 (stated on page) | Already in keypoint form and directly on-topic; zero license ambiguity | Tiny — suitable only as eval / smoke-test set, not for training a generalizable model |
| **Climbing Holds and Volumes** (Blackcreed) | https://universe.roboflow.com/blackcreed-xpgxh/climbing-holds-and-volumes | Object detection (holds/volumes) | Variable | No | n/a | Check per-project license on page | Not pose, but good for later gating logic / scene understanding; can contribute *images* of climbing scenes where we could auto-label poses | No human labels |
| **Bouldering holds** (Pwals) · **Hold Detector** (Climb AI) · **Climbing Holds Detection** (Isira) · **Climbing Holds Detector** (Gabriel Murry) | universe.roboflow.com (search results above) | Hold detection / segmentation | Various | No | n/a | Per-project | Source of climbing-scene imagery for auto-pose-labeling; redundant with Blackcreed set | Copy/overlap between projects; dedupe before use |

## Tier C — General pose datasets (baseline + fine-tune source)

| Name | URL | Type | Approx size | Has keypoints? | KP format | License | Why it helps | Concerns |
|---|---|---|---|---|---|---|---|---|
| **COCO Keypoints 2017 / COCO-Pose** | https://cocodataset.org/ · Ultralytics wrapper: https://docs.ultralytics.com/datasets/pose/coco/ | Images + keypoints + bboxes | ~200k images · 250k person instances | Yes | **COCO-17** (exact target format) | Annotations: CC BY 4.0; images: Flickr-originated, Flickr terms | The canonical training source for YOLO-Pose; Ultralytics YAML is turnkey | Almost no climbing examples; vanilla COCO-Pose will underperform on back-facing climbers — must be *combined* with climbing-specific fine-tune set |
| **MPII Human Pose** | http://human-pose.mpi-inf.mpg.de/ | Images + keypoints + activity labels | ~25k images · ~40k people · 410 activity classes | Yes | **MPII-16** (not COCO-17 — conversion required) | Simplified BSD for annotations; **research only** — commercial use not allowed | Activity labels include sports and may include climbing-like actions (e.g., gymnastics, bouldering — verify) | MPII-16 ≠ COCO-17 (different joint set); research-only license makes it unsafe for a shipped product — restrict to pretraining / research evaluation only |
| **AIST++** | https://google.github.io/aistplusplus_dataset/ | Multi-view dance video + 3D + 2D keypoints | ~10.1M frames · 30 subjects · 9 views | Yes | **COCO-17** (2D) + SMPL (3D) | Annotations: CC BY 4.0 (Google LLC); underlying AIST video is a separate license | Large volume of *articulated, extreme-range-of-motion* poses that share overlap with climbing (legs above head, asymmetric limbs) — good auxiliary pretraining signal | Not climbing; underlying video license is separate from annotation license — check before redistributing frames |
| **PoseTrack21** | https://github.com/anDoer/PoseTrack21 · paper: https://openaccess.thecvf.com/content/CVPR2022/papers/Doring_PoseTrack21_... | Video + multi-person pose + tracking | ~177k frames across tracking sequences | Yes | Close to COCO-17 (verify) | Requires signed agreement emailed to maintainer | Adds *temporal* pose structure (tracking) we may want later for climb-sequence smoothing | Non-trivial access process; skip for first baseline |
| **CrowdPose** | https://github.com/Jeff-sjtu/CrowdPose | Images + multi-person keypoints (crowded) | 20k images (10k/2k/8k) · sourced from COCO+MPII+AI-Challenger | Yes | 14-joint variant (close to but not identical to COCO-17) | Verify on repo (license not confirmed in search) | Crowded-scene robustness; minor relevance to climbing (usually single subject) | Different KP schema; low priority for a climbing-focused run |

## Tier D — Video sources for later frame-sampling + pseudo-labeling

These are *not* pose datasets. They are candidate video corpora we can sample frames from, then auto-label with a strong off-the-shelf pose model and human-verify.

| Name | URL | Type | Approx size | Has keypoints? | License | Why it helps | Concerns |
|---|---|---|---|---|---|---|---|
| **Kinetics-700** | https://github.com/cvdfoundation/kinetics-dataset · https://arxiv.org/abs/1907.06987 | Video action recognition; YouTube URL list | ≥600 clips per class × 700 classes; includes **"rock climbing"** and **"bouldering"** action classes (verify class list) | No | Kinetics annotations: CC BY 4.0; videos: individual YouTube licenses (varies, often standard YouTube license) | Hundreds of curated 10s clips per climbing class is a huge source of climbing-scene frames | YouTube-hosted clips — link rot is real; each video has its own license; redistribution of frames requires care |
| **ActivityNet** | http://activity-net.org/ | Video action detection | 20k videos · 200 classes (includes climbing-related classes; verify) | No | Annotations: research license; underlying videos: YouTube | Clip-level labels for climbing-adjacent actions | Same YouTube-license caveat as Kinetics |
| **YouTube Creative Commons search** | https://www.youtube.com/ (filter: Creative Commons) | Long-form climbing/bouldering videos | Unbounded | No | CC BY 3.0 (YouTube's only CC option) | Direct source of legally frame-samplable climbing footage | Requires manual curation; CC-BY attribution must be preserved in downstream model card |
| **Vimeo CC filter** | https://vimeo.com/creativecommons | Long-form climbing videos | Unbounded | No | Various CC licenses per video (BY, BY-SA, BY-NC, etc.) — check per video | Higher-quality footage than YouTube on average; per-video license is explicit | NC variants are unusable if we ship commercially; must filter |
| **Wikimedia Commons (climbing)** | https://commons.wikimedia.org/wiki/Category:Climbing | Images + some video | Thousands of files | No | Per-file (almost all CC-BY, CC-BY-SA, or public domain) | Cleanest license story of any video source; good for augmentation | Often static photos rather than motion sequences |

---

## Quick prioritization for the first public-only baseline (Step 3)

Scout recommendation, **revised after CIMI4D license verification**:

1. **Primary pretrain backbone (commercial-clean):** COCO-Pose 2017 — CC-BY 4.0 annotations, already supported by Ultralytics out of the box; it is the format the model expects.
2. **Climbing fine-tune signal — commercial-clean only:**
   - **VAF Bouldering Poses** (Roboflow, CC-BY 4.0, native COCO-17 keypoints) — tiny (~41 images) but the only directly-licensable climbing KP set found.
   - Frame-sampled + pseudo-labeled videos from **The Way Up** (Zenodo, license to verify) and **CC-licensed YouTube/Vimeo climbing footage** — primary path to volume.
   - **NOT** CIMI4D or ClimbingCap (their license bans commercial training).
3. **Auxiliary articulated-pose breadth (commercial-clean):** AIST++ — CC BY 4.0 annotations, already COCO-17, large.
4. **Research-only parallel track (separate weights):** CIMI4D / ClimbingCap can be used to train and evaluate a *research baseline* model that is **not shipped** but is useful for ceiling estimates, ablation studies, and academic comparisons. Keep these weights and any frames from them strictly outside the shipped app bundle and outside any commercial DVC remote.
5. **Defer:** PoseTrack21 (signed agreement), CrowdPose (different KP schema), MPII (research-only license — same disqualifier as CIMI4D for the shipping model).

## Open questions for Agent 2 / license reviewer

- ✅ ~~CIMI4D and ClimbingCap — exact license terms~~ — **resolved 2026-04-26**: research-only, commercial training prohibited (LiDAR Human Motion site license).
- The Way Up Zenodo record (https://zenodo.org/records/15196867) — which CC variant exactly? Need this before sampling frames.
- Kinetics-700 class list in the 2020 revision — does it still include both "rock climbing" and "bouldering" as separate classes?
- Roboflow per-project licenses beyond the VAF Bouldering Poses set — verify each before ingestion.
- Is *this app* in fact commercial in the legal sense the LiDAR Human Motion license is using? If we ship as a paid App Store product, yes. If we ship as a free research demo with no monetization, the answer is closer to "yes, still problematic for derivative weights." Default to "treat as commercial" until product confirms otherwise.

---

*End of scout report. Nothing downloaded. Nothing trained.*
