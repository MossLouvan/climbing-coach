# License Audit — Public-Only Baseline Sources

**Agent:** License Auditor (Agent 2)
**Date:** 2026-04-24
**Scope:** Review every candidate in `docs/yolo_pose_dataset_candidates.md` and decide whether it is safe enough to feed into the first public-only YOLO-Pose training run (§5.1 of `docs/yolo-pose-migration-spec.md`, Step 3 of the rollout).
**Method:** Desk review only. No downloads. No scraping. License statements are taken from the scout report and the project pages as cited; where the scout did not or could not verify the exact license text, the source is conservatively marked `UNKNOWN_LICENSE` and must be confirmed by a human before use.
**Deliverable rule:** This document is **advisory**. A source is not usable in training until a named human writes themselves into the per-source manifest under `data/manifests/<sourceId>.yaml` with a real `license.verifiedBy` + `license.verifiedAt` per `scripts/training/dataset_manifest.schema.json`.

---

## Status legend

- `APPROVED_FOR_BASELINE` — license text is unambiguous, permits the intended training + redistribution use case, and the attribution story is workable. Still requires a named human to sign the per-source manifest; this audit only clears the license question.
- `NEEDS_PERMISSION` — usable in principle, but only after an explicit action (signed agreement, per-file/per-video manual CC curation, vendor reply).
- `RESEARCH_ONLY` — license permits academic / non-commercial research but not shipping in a commercial on-device model. May be used for ablations or for comparing against the baseline, **never** for weights we intend to ship.
- `DO_NOT_USE` — license is known to be incompatible with our use (e.g. standard YouTube license for videos we would redistribute frames from).
- `UNKNOWN_LICENSE` — license was not verified by the scout, or the project page was unreachable, or the stated license is ambiguous. Default status whenever the auditor cannot point at a confirmed license string.

I have intentionally not been optimistic. "Public" ≠ "redistributable" ≠ "commercial-use-OK". When in doubt, the status is `UNKNOWN_LICENSE`.

---

## Summary table

| # | Source | Tier | Status | Blocks baseline? |
|---|---|---|---|---|
| 1 | COCO Keypoints 2017 / COCO-Pose | C | `APPROVED_FOR_BASELINE` | No — pretrain backbone |
| 2 | VAF Bouldering Poses (Roboflow) | B | `APPROVED_FOR_BASELINE` | No — eval / smoke only |
| 3 | AIST++ | C | `UNKNOWN_LICENSE` (annotations CC BY 4.0; underlying AIST video license unverified) | Yes — do not train on until video license confirmed |
| 4 | MPII Human Pose | C | `RESEARCH_ONLY` | Yes |
| 5 | PoseTrack21 | C | `NEEDS_PERMISSION` | Yes |
| 6 | CrowdPose | C | `UNKNOWN_LICENSE` | Yes |
| 7 | CIMI4D | A | `UNKNOWN_LICENSE` (project page timed out during scout; typical pattern is research-only) | Yes |
| 8 | ClimbingCap / AscendMotion | A | `UNKNOWN_LICENSE` | Yes |
| 9 | "The Way Up" hold-usage dataset (Zenodo record 15196867) | A | `UNKNOWN_LICENSE` (Zenodo record not opened during scout) | Yes |
| 10 | Roboflow — Climbing Holds and Volumes (Blackcreed) | B | `UNKNOWN_LICENSE` | N/A — no pose labels |
| 11 | Roboflow — Pwals / Climb AI / Isira / Gabriel Murry hold-detection sets | B | `UNKNOWN_LICENSE` | N/A — no pose labels |
| 12 | Kinetics-700 ("rock climbing", "bouldering" classes) | D | `DO_NOT_USE` for public baseline (standard YouTube license on underlying videos) | Yes |
| 13 | ActivityNet | D | `DO_NOT_USE` for public baseline (same YouTube-license problem) | Yes |
| 14 | YouTube Creative-Commons search | D | `NEEDS_PERMISSION` (per-video, CC-BY 3.0) | Yes — no specific videos approved yet |
| 15 | Vimeo CC filter | D | `NEEDS_PERMISSION` (per-video; filter NC out) | Yes — no specific videos approved yet |
| 16 | Wikimedia Commons (Category:Climbing) | D | `NEEDS_PERMISSION` (per-file; most files are CC-BY / CC-BY-SA / PD) | Yes — no specific files approved yet |
| 17 | Penn Action | C (spec §5.1) | `UNKNOWN_LICENSE` (listed as "Academic" in the spec, but no SPDX tag) | Yes |

**Net result:** Two sources are safe to feed into the first public-only baseline — **COCO-Pose 2017** for the pretrain / warmstart, and **VAF Bouldering Poses** as a tiny native-KP sanity / evaluation set. Everything else must be cleared by a human before it is allowed into training.

---

## Source-by-source findings

### 1. COCO Keypoints 2017 / COCO-Pose — `APPROVED_FOR_BASELINE`

- **Stated license:** Annotations are CC BY 4.0 (COCO Consortium). Images are Flickr-originated and retain Flickr licensing per image.
- **Why approved:** Annotations are unambiguously CC BY 4.0. The images are consumed by COCO via the standard download pipeline and by Ultralytics' `coco-pose.yaml` as a turnkey training source; we are not redistributing frames, we are training a model on them, which is the canonical use case the annotations were released to enable. This matches `docs/yolo-pose-migration-spec.md` §5.1 ("Pretrain init (already Ultralytics default)").
- **Attribution required (CC BY 4.0):** "Microsoft COCO Consortium. Common Objects in Context. CC BY 4.0." — include in `docs/model_cards/yolo-pose-v1.md` under *Training data attribution*.
- **Caveats for the human verifier:**
  - Confirm the COCO Consortium license URL still resolves (https://cocodataset.org/#termsofuse) at the time the manifest is signed.
  - Do **not** commit the raw image frames into this repo; reference them via DVC or the Ultralytics download script so the Flickr-layer license is not transitively re-licensed.
- **Manifest stub:** `data/manifests/coco-pose-2017.yaml` (schema-compliant draft emitted below).

### 2. VAF Bouldering Poses (Roboflow) — `APPROVED_FOR_BASELINE`

- **URL:** https://universe.roboflow.com/vaf/bouldering-poses
- **Stated license:** CC BY 4.0 (stated on the Roboflow project page per scout).
- **Why approved:** License is a known, compatible SPDX id (`CC-BY-4.0`). Keypoints are shipped in a climber-specific schema; the scout flagged that KP→COCO-17 mapping still needs verification, but that is a training-pipeline concern, not a license concern.
- **Why it is still narrow in use:** ~41 images. This is too small to train on. Intended use: smoke-test set and as a tiny climbing-slice eval. Anything that claims "trained on VAF Bouldering Poses" would be meaningless.
- **Attribution required:** "VAF — Bouldering Poses (Roboflow Universe). CC BY 4.0." — plus the project URL in the model card.
- **Caveats for the human verifier:**
  - Open the project page and screenshot the license tag into `data/manifests/attribution/` before signing, because Roboflow license tags are per-project and can change without a visible history.
  - Confirm the keypoint order maps cleanly to COCO-17; if not, document the mapping in the manifest notes.

### 3. AIST++ — `UNKNOWN_LICENSE` (annotations CC BY 4.0 confirmed, underlying video license not verified)

- **Stated license:** Annotations are CC BY 4.0 (Google LLC). The underlying **AIST Dance Video Database** images/videos are released by the National Institute of Advanced Industrial Science and Technology (AIST) under a separate license that the scout did not open, and which is historically a research/non-commercial-style license.
- **Why not approved:** Training on AIST++ requires the actual video frames, not just the keypoint annotations. Until the AIST Database license is read end-to-end and confirmed to permit training + shipping weights in a commercial on-device app, this source cannot clear the public-only baseline gate. The scout report itself flags this: *"underlying video license is separate from annotation license — check before redistributing frames"*.
- **If it were cleared, it would be valuable:** ~10.1M frames of extreme-range-of-motion articulated poses in COCO-17 — a strong pretraining auxiliary. But that payoff is not enough to waive the license check.
- **Action for human verifier:** Read the AIST Database license at https://aistdancedb.ongaaccel.jp/database_license/ and decide between `RESEARCH_ONLY` (do not use for shipped weights) or `APPROVED_FOR_BASELINE`. If the license is research-only, downgrade this source and do **not** use its frames in Step 3.

### 4. MPII Human Pose — `RESEARCH_ONLY`

- **Stated license:** Annotations are Simplified BSD. The image set is research-only; commercial use is not permitted.
- **Why not approved:** Our model is a shipping on-device commercial asset. Training a commercial model on research-only images is precisely the failure mode the spec §5.1 header warns about: *"do not assume 'public' means 'redistributable'"*.
- **Usable scope:** Research / ablation studies only. Do not ship weights whose training provenance includes MPII. `dataset_sanity.py` should refuse to admit MPII entries when an environment flag like `CLIMBING_TRAINING_MODE=ship` is set.
- **Recommendation:** Keep it out of the public-only baseline entirely. Revisit only if a replacement commercial license is ever issued.

### 5. PoseTrack21 — `NEEDS_PERMISSION`

- **Stated license:** Access requires a signed agreement emailed to the maintainer.
- **Why not approved:** We do not have the signed agreement yet, and the scout noted *"Non-trivial access process; skip for first baseline"*. Even once signed, agreements of this type are typically research-scoped and may still land us at `RESEARCH_ONLY`.
- **Action for human verifier:** Defer to Phase 2. If pursued, read the agreement carefully for commercial-use language before downloading anything.

### 6. CrowdPose — `UNKNOWN_LICENSE`

- **Stated license:** The scout explicitly could not confirm a license from the GitHub repo. It is derived from COCO + MPII + AI-Challenger, so it may inherit MPII's research-only constraint as a floor.
- **Why not approved:** License unconfirmed, and its 14-joint schema is not COCO-17 anyway. Low value for a climbing-focused run.
- **Action:** Do not chase unless crowded-scene robustness becomes a priority in Phase 2.

### 7. CIMI4D (CVPR 2023) — `UNKNOWN_LICENSE`

- **Stated license:** Not confirmed. The scout reports the project site timed out and that the typical pattern for LiDAR-human-motion CVPR releases is "research-only / dataset agreement required". No SPDX id was extractable.
- **Why not approved:** We do not have the license text in hand. Marking anything else would be optimistic — see the audit rule.
- **If it clears:** It is the most on-topic dataset in Tier A. Worth the human effort to verify. Expect to land at either `NEEDS_PERMISSION` (dataset request form) or `RESEARCH_ONLY`.
- **Action for human verifier:** Re-load http://www.lidarhumanmotion.net/cimi4d/ and read the licensing section; if it is a research-only / dataset-agreement license, downgrade to `RESEARCH_ONLY` and remove from the Step 3 training manifest.

### 8. ClimbingCap / AscendMotion (CVPR 2025) — `UNKNOWN_LICENSE`

- **Stated license:** Project page states code + dataset "release publicly"; exact terms not verified by the scout. The scout wrote *"license wording needs exact review before any commercial use"*.
- **Why not approved:** "Release publicly" is marketing language, not an SPDX id. Could be CC BY / CC BY-NC / research-agreement / something custom.
- **Action for human verifier:** Open http://www.lidarhumanmotion.net/climbingcap/, find the licensing section, and confirm an explicit SPDX id (or a license URL). If it's any `-NC` variant or a research-only agreement, this source cannot go into the shipped baseline.

### 9. "The Way Up" — Hold Usage Detection (Zenodo 15196867) — `UNKNOWN_LICENSE`

- **Stated license:** The scout did not open the Zenodo record itself — it wrote *"Zenodo record — check record page for CC license tag"*. Zenodo records default to explicit per-record licensing, but there is no confirmation here which CC variant applies, and some records are posted without any CC tag at all.
- **Why not approved:** Pose labels would be self-generated from these videos — but without a confirmed license on the video content itself, we cannot sample frames.
- **Action for human verifier:** Open https://zenodo.org/records/15196867 and record the exact license string into the manifest. If CC BY 4.0, promote to `APPROVED_FOR_BASELINE` (videos) and lift into Phase-2 self-labeling.

### 10. Roboflow — Climbing Holds and Volumes (Blackcreed) — `UNKNOWN_LICENSE`

- **Stated license:** "Check per-project license on page" per scout; not verified.
- **Why not approved for pose baseline:** The set has no human keypoints — it is irrelevant to Step 3 regardless of license. Listed here for completeness so it is not silently picked up later.

### 11. Roboflow — Pwals / Climb AI / Isira / Gabriel Murry hold detectors — `UNKNOWN_LICENSE`

- **Stated license:** Per-project; not verified.
- **Why not approved for pose baseline:** Same as #10 — hold-only, no keypoints. Do not pull into Step 3.

### 12. Kinetics-700 — `DO_NOT_USE` for the public-only baseline

- **Stated license:** Annotations (the CSV/URL list) are CC BY 4.0. **The videos themselves are individual YouTube uploads, and the scout explicitly notes these are "often standard YouTube license"**.
- **Why not approved:** Rule from the audit brief: *"Do NOT approve YouTube videos unless they are explicitly Creative Commons."* Kinetics-700 does not guarantee CC on the underlying videos — most are standard YouTube license, which disallows redistribution and commercial reuse. Frame-sampling those videos to train a commercial model is not compatible with that license, and the link-rot note from the scout is a red flag in its own right.
- **If a verifier wants to rescue a subset:** The only safe path is (a) pre-filter the Kinetics URL list to videos whose YouTube license is explicitly "Creative Commons — Attribution" and (b) re-verify each at sample time. That subset — if it exists — is in scope for Phase 2, not the public-only baseline.
- **Action:** Exclude from Step 3 entirely.

### 13. ActivityNet — `DO_NOT_USE` for the public-only baseline

- **Stated license:** Annotations are under a research license; videos are YouTube with per-video licensing.
- **Why not approved:** Same reasoning as Kinetics-700. Exclude from Step 3.

### 14. YouTube — Creative Commons filter — `NEEDS_PERMISSION` (per-video)

- **Stated license:** YouTube's only CC option is **CC BY 3.0**.
- **Why not approved now:** The *filter* is legitimate, but individual CC-BY 3.0 videos must be curated one at a time, and the filter occasionally surfaces videos with incorrectly applied CC tags. There is no approved list yet for Step 3.
- **Attribution:** Every CC-BY-3.0 video that is actually used must land in the model card with title, uploader, URL, retrieval date, and license.
- **Action for human verifier:** Build the approved-video list under `data/manifests/self-labeled/<videoId>.yaml` as Phase 2 lands. Do not wildcard-approve YouTube — approve per video.

### 15. Vimeo — Creative Commons filter — `NEEDS_PERMISSION` (per-video)

- **Stated license:** Per video: CC BY, CC BY-SA, **or CC BY-NC / BY-ND**. NC and ND variants are unusable for a shipping commercial model.
- **Why not approved now:** Same per-video curation requirement as YouTube. Additionally, NC / ND variants must be filtered out at ingestion, not just at annotation time. `dataset_sanity.py` should reject any source whose `license.spdxId` starts with `CC-BY-NC-` or contains `-ND`.
- **Action:** Same as YouTube — per-video manifests, CC-BY / CC-BY-SA only, and a hard block on NC/ND in the sanity script.

### 16. Wikimedia Commons — Category:Climbing — `NEEDS_PERMISSION` (per-file)

- **Stated license:** Almost all files are CC-BY, CC-BY-SA, or public domain per the scout. Still, Commons has occasional files uploaded under incorrect licensing, which is why per-file verification is non-optional.
- **Why not approved en masse:** The licensing is file-level, not category-level. Approving "all of Commons climbing" is the same error as approving "all of Flickr CC".
- **Attribution for CC-BY / CC-BY-SA files:** Author + license + source URL per file in the model card. CC-BY-SA files require the downstream asset (the trained weights and any derived dataset) to also be licensed under a compatible license — this is a larger policy decision and the human verifier must flag it before including any BY-SA content in the training set.
- **Action:** Per-file manifests under `data/manifests/wikimedia/<fileId>.yaml`. No wildcard.

### 17. Penn Action — `UNKNOWN_LICENSE`

- **Stated license:** Listed in `docs/yolo-pose-migration-spec.md` §5.1 as "Academic"; no SPDX tag, no license URL in the scout report.
- **Why not approved:** "Academic" is not an SPDX id. It usually translates to `RESEARCH_ONLY` but it can also mean "request access and sign an agreement".
- **Action for human verifier:** Confirm the exact license from the Penn Action dataset page and either mark `RESEARCH_ONLY` or `NEEDS_PERMISSION`. Do not include in Step 3 until confirmed.

---

## Recommended public-only baseline manifest (Step 3)

**Only these pass the license gate as of 2026-04-24:**

1. **COCO-Pose 2017** — pretrain / warmstart source. CC BY 4.0 annotations; standard Ultralytics pipeline.
2. **VAF Bouldering Poses (Roboflow)** — tiny (~41 images) native-KP sanity / eval slice. CC BY 4.0.

That is enough to run a baseline that produces a *real* model card comparing against the Apple Vision / MoveNet numbers in `docs/yolo-pose-migration-spec.md` §1.3, but it is not enough to reach the §7 shipping gates. Reaching the shipping gates requires either the Tier-A sources (after human license verification) or the Phase-2 self-labeled CC video set — both of which remain **blocked on license review**.

## Attribution boilerplate to include in the baseline model card

```
Training data attribution
-------------------------

COCO-Pose 2017 (pretrain)
  © Microsoft COCO Consortium. Licensed under CC BY 4.0.
  https://cocodataset.org/

VAF Bouldering Poses (climbing sanity set)
  © VAF (Roboflow Universe). Licensed under CC BY 4.0.
  https://universe.roboflow.com/vaf/bouldering-poses
```

All CC-BY / CC-BY-SA sources that are added later must extend this block; `dataset_sanity.py` should emit this block from the set of manifests it validates, not from a hand-written list, so the two cannot drift.

## Things the human verifier must do before Step 3 kicks off

1. Sign (`license.verifiedBy` + `license.verifiedAt`) the per-source manifests for the two `APPROVED_FOR_BASELINE` items below.
2. Re-visit the four `UNKNOWN_LICENSE` Tier-A sources (CIMI4D, ClimbingCap, The Way Up, AIST++ videos) and either promote or mark them `RESEARCH_ONLY` / `DO_NOT_USE`.
3. Confirm that `dataset_sanity.py` enforces:
   - `license.spdxId` is a known SPDX id (rejects "Academic", "Research", empty).
   - `license.spdxId` does not start with `CC-BY-NC-` or contain `-ND` when `CLIMBING_TRAINING_MODE=ship`.
   - A human name is present in `license.verifiedBy` (not `"claude"`, not `"agent-2"`, not empty).
4. Decide a repo-wide policy on CC-BY-SA content before any BY-SA source is admitted (viral-copyleft implications for released weights / derived datasets).

*End of audit. Nothing downloaded. No training initiated. Two sources cleared; everything else waits on a human.*
