# Climbing Coach — Product Specification

**Version:** 1.0 (MVP)
**Status:** Working implementation
**Platform:** iOS (Expo / React Native), Node-compatible domain core
**Last updated:** 2026-04-23

---

## 1. Product overview

Climbing Coach is an iPhone application that analyzes a climber's
**technique** from a single phone video. Unlike pro-comparison tools, it
scores climbing-specific biomechanics — balance, hip positioning,
flagging, reach efficiency, stability, dynamic control, smoothness, and
route adherence — and returns interpretable, route-aware coaching tips.

The product is **local-first**: no auth, no cloud, no social features.
All data lives on-device in SQLite. The architecture is designed to
accept a remote storage adapter without restructuring.

### 1.1 Goals

- Give intermediate climbers actionable, route-specific feedback that
  they can apply on their next attempt.
- Keep every score **explainable**: each category is a pure function
  with a written rationale, not a black-box neural net.
- Run end-to-end on a phone with no server dependency.
- Stay debuggable in Node — the `domain/` and `analysis/` layers run
  with zero native deps.

### 1.2 Non-goals (V1)

- Comparing the user to professional climbers.
- Multi-user social features, leaderboards, or sharing.
- Automatic hold detection (manual tagging only in V1).
- Cloud sync, accounts, or auth.
- Real-time / on-the-wall coaching during a climb.

---

## 2. User stories

### 2.1 Primary flow

1. **As a climber**, I open the app and immediately see a fully analyzed
   demo session so I understand what the product does before I commit
   any of my own video.
2. **As a climber**, I record a climb in-app or upload a clip from my
   library.
3. **As a climber**, I tag the holds on a single reference frame,
   pick each hold's type and role, and arrange the intended sequence.
4. **As a climber**, the app analyzes my climb and shows a
   synchronized analysis view: video + 2D skeleton, an orbiting 3D
   stick skeleton, a phase timeline, an 8-category score grid, and
   coaching tips with explanations.
5. **As a returning climber**, I see a sparkline of my technique
   progression over time on the Home screen.

### 2.2 Secondary flows

- **Compare** two sessions side-by-side (`CompareScreen`).
- **Re-tag** holds on an existing session and re-run analysis.
- **Browse** historical sessions and drill into any one.

---

## 3. Functional requirements

### 3.1 Capture

| ID    | Requirement                                                                |
| ----- | -------------------------------------------------------------------------- |
| F-1.1 | Record video via `expo-camera` `CameraView`; save to app file system.      |
| F-1.2 | Upload existing video via `expo-image-picker`; auto-extract a thumbnail.   |
| F-1.3 | Persist `Video` metadata: URI, duration, dimensions, fps, thumbnail, size. |
| F-1.4 | Reject videos shorter than the minimum analyzable duration.                |

### 3.2 Hold tagging

| ID    | Requirement                                                                                        |
| ----- | -------------------------------------------------------------------------------------------------- |
| F-2.1 | Display reference frame; tap to add a hold at normalized `[0,1]` image coordinates.                |
| F-2.2 | Per-hold editor for type (jug, crimp, pinch, sloper, pocket, foot_chip, volume, unknown) and role. |
| F-2.3 | Drag to reposition; long-press to delete; undo last action.                                        |
| F-2.4 | Sequence editor — order holds and assign intended limb per step.                                   |
| F-2.5 | Tagging is required before analysis can run.                                                       |

### 3.3 Wall detection gate

| ID    | Requirement                                                                              |
| ----- | ---------------------------------------------------------------------------------------- |
| F-3.1 | Before analysis, run a wall-detection caption check on a sampled frame.                  |
| F-3.2 | If the gate determines the frame does not depict a climbing wall, fail fast with reason. |
| F-3.3 | The gate is configurable and can be bypassed for tests via DI.                           |

### 3.4 Analysis pipeline

`analyzeSession()` in `src/analysis/pipeline.ts` is the single
orchestrator.

| ID    | Requirement                                                                              |
| ----- | ---------------------------------------------------------------------------------------- |
| F-4.1 | Pose inference via pluggable `PoseProvider` (`MockPoseProvider` or `TFJSPoseProvider`).  |
| F-4.2 | If the preferred real provider fails with `NEEDS_DEV_BUILD`, fall back to mock and badge the session **Demo**. |
| F-4.3 | Pseudo-3D lift via heuristic `PseudoLifter` (anthropometric bone lengths + climbing priors). |
| F-4.4 | Emit `liftConfidence`; surface a caveat when overhang priors break.                      |
| F-4.5 | Phase segmentation into `setup | weight_shift | reach | dyno | match | flag | rest`.     |
| F-4.6 | Score 8 categories via pure functions; each returns `{ score (0..100), rationale }`.     |
| F-4.7 | Compose per-phase + global tips with severities.                                         |
| F-4.8 | Pipeline is deterministic when given a deterministic pose provider (used in tests).      |

### 3.5 Visualization

| ID    | Requirement                                                                                  |
| ----- | -------------------------------------------------------------------------------------------- |
| F-5.1 | Synchronized scrubber drives video playback, 2D overlay, and 3D skeleton.                    |
| F-5.2 | 2D `PoseOverlay` (SVG) draws keypoints + bones in normalized space.                          |
| F-5.3 | 3D `Skeleton3D` (`expo-gl` + `three`) renders 17 joint spheres and 12 bone lines per frame.  |
| F-5.4 | Stylized capsule/torso body mesh — labeled in source as approximation; pluggable upgrade.    |
| F-5.5 | Phase timeline with click-to-seek.                                                           |
| F-5.6 | 8-category score grid with rationale on tap.                                                 |
| F-5.7 | Coaching tip list with severity badges.                                                      |

### 3.6 Persistence

| ID    | Requirement                                                              |
| ----- | ------------------------------------------------------------------------ |
| F-6.1 | SQLite schema v1 with tables: `users`, `routes`, `videos`, `sessions`, `schema_migrations`. |
| F-6.2 | Heavy artifacts (`poseTrack`, `phases`, `report`, `holds`, `sequence`) stored as JSON blobs in TEXT columns. |
| F-6.3 | `PRAGMA foreign_keys = ON`; cascade rules: user→sessions cascade, video→session cascade, route→RESTRICT. |
| F-6.4 | Two adapters: `openExpoSqliteDatabase()` on device, `inMemoryDb()` for Node tests. |
| F-6.5 | Repositories expose domain-shaped operations only; screens never touch SQL. |

### 3.7 Seeding & demo

| ID    | Requirement                                                                                  |
| ----- | -------------------------------------------------------------------------------------------- |
| F-7.1 | `seedDemoData(repos)` is idempotent.                                                         |
| F-7.2 | Inserts demo user, `DEMO_ROUTE` (6 holds, 6-step sequence), and one analyzed session.        |
| F-7.3 | Demo session is generated by running the **real** pipeline against the mock pose provider.   |
| F-7.4 | Demo sessions are visually badged **Demo** in the UI.                                        |

### 3.8 Progression

| ID    | Requirement                                                                  |
| ----- | ---------------------------------------------------------------------------- |
| F-8.1 | Home screen shows a sparkline of overall technique score across sessions.    |
| F-8.2 | Session list orders by recency; tap to open the analysis screen.             |
| F-8.3 | `CompareScreen` allows side-by-side review of two sessions.                  |

---

## 4. Scoring categories

All categories return `score ∈ [0, 100]` with a written rationale.

| Category           | Definition                                                                          |
| ------------------ | ----------------------------------------------------------------------------------- |
| `balance`          | CoM-x inside support-x column.                                                      |
| `hip_positioning`  | Hip under active hand hold.                                                         |
| `flagging`         | Counterbalance usage; penalize off-center reaches without an engaged flag.          |
| `reach_efficiency` | Direct distance ÷ actual hand path length.                                          |
| `stability`        | Mean CoM jerk during `setup` and `rest` phases.                                     |
| `dynamic_control`  | Post-catch horizontal swing magnitude.                                              |
| `smoothness`       | Mean CoM jerk over the whole clip.                                                  |
| `route_adherence`  | Actual hold contact sequence vs. tagged intended sequence.                          |

Composition: per-phase scores → overall via configurable weights.
Coaching tips are emitted both per-phase and globally with severities.

---

## 5. Data model (summary)

Full reference: [`docs/DATA_MODEL.md`](./DATA_MODEL.md).

Entities: `User`, `Route`, `Hold`, `RouteSequenceStep`, `Video`,
`Session`, `Pose2D`, `Pose3D`, `PoseTrack`, `MovementPhase`,
`TechniqueReport`, `CoachingTip`.

Conventions:

- All IDs are opaque branded strings, generated client-side.
- All 2D positions are normalized to `[0, 1]` with origin top-left.
- `Pose3D.joints[i]` corresponds to `Pose2D.keypoints[i]` (17 keypoints,
  COCO / MoveNet layout).

---

## 6. Architecture (summary)

Full reference: [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md).

Layered modules — dependencies flow downward only.

```
 app/      — screens, navigation, zustand store, theme  (RN + Expo)
 viz/      — PoseOverlay (SVG), Skeleton3D (expo-gl + three)
 ─────────────────────────────────────────────────────
 storage/  — sqlite schema, Database interface, repos, seeds
 analysis/ — pose providers, pseudo-3D lifter, kinematics, holds, wall detector
 domain/   — pure models, phase segmentation, scoring engine
```

Invariants:

- `domain/` is dependency-free (no React, no `three`, no Expo, no SQLite).
- `analysis/` depends only on `domain/`.
- `storage/` depends on `domain/` + the abstract `Database` interface.
- `viz/` depends on `domain/` + `three`/`react-native-svg`.
- `app/` is the only layer allowed to import from Expo/React Native.

---

## 7. Real vs approximated components

Honesty matters; everything below is also surfaced in source comments
and the README.

| Component                | Status     | Notes                                                                 |
| ------------------------ | ---------- | --------------------------------------------------------------------- |
| Video recording          | Real       | `expo-camera` CameraView, saved to FS.                                |
| Video upload             | Real       | `expo-image-picker` + thumbnail extraction.                           |
| Manual hold tagging      | Real       | Normalized coords, type/role/sequence editor, undoable.               |
| Wall detection gate      | Real       | HF caption check on sampled frame (DI-overridable).                   |
| 2D pose inference        | Pluggable  | `MockPoseProvider` (seeded) or `TFJSPoseProvider` (needs dev build).  |
| Pseudo-3D lift           | Heuristic  | Anthropometric bone lengths + climbing priors. Not a learned model.   |
| Phase segmentation       | Real       | Rule-based state machine.                                             |
| Scoring engine           | Real       | 8 interpretable categories, pure functions.                           |
| 3D stick skeleton        | Real       | `expo-gl` + `three`; per-frame mutation, no allocations.              |
| Stylized body mesh       | Approx.    | Capsule per limb + torso box. Labeled in source. Upgrade path local.  |
| Route-aware coaching     | Real       | Uses tagged holds, support polygon, intended sequence.                |
| Session history          | Real       | SQLite on device / in-memory in tests.                                |

---

## 8. Non-functional requirements

### 8.1 Performance

- 3D skeleton renders at the device's natural display rate without
  per-frame allocations (one `THREE.Scene`, mutated in place).
- Analysis of a typical 10–20 second clip completes in interactive time
  on a modern iPhone.
- In-memory SQL fake parses only the SQL subset the app emits — fast
  and deterministic in CI.

### 8.2 Reliability

- All errors surface to the UI with actionable messages; no silent
  swallowing.
- `inMemoryDb()` throws loudly on unknown SQL rather than silently
  returning empty results.
- Pipeline produces caveats (not crashes) when priors are violated.

### 8.3 Testability

- Domain and analysis layers run in Node with zero native deps.
- ≥80% test coverage across `domain/`, `analysis/`, and `storage/`.
- Tests use deterministic seeded providers; CI runs `npm test` +
  `npm run typecheck`.

### 8.4 Maintainability

- File organization: many small, focused files (typical 200–400 lines,
  800 max).
- Immutability throughout; never mutate domain objects.
- Each scoring heuristic is a pure function with a rationale; new
  categories can be added by following the same shape.

### 8.5 Privacy & security

- No accounts, no telemetry, no network calls in V1 (other than the
  optional wall-detection caption check, which is configurable).
- Video bytes never leave the device.
- No secrets in source; no PII collected beyond optional `displayName`
  and `heightM`.

---

## 9. Platform & dependencies

- **Runtime:** Node ≥ 20, iOS 16+ recommended.
- **Build:** Xcode 16+ for native builds; Expo Go works against the
  mock pose provider.
- **Key libraries:** `expo` ~54, `react-native` 0.81, `react` 19,
  `three` 0.166, `expo-gl`, `expo-camera`, `expo-sqlite`,
  `expo-video`, `react-native-svg`, `zustand`.
- **Optional (real pose):** `@tensorflow/tfjs`,
  `@tensorflow/tfjs-react-native`,
  `@tensorflow-models/pose-detection`, `react-native-fs`.

---

## 10. Test strategy

| Layer       | What is tested                                                        |
| ----------- | --------------------------------------------------------------------- |
| `domain/`   | Phase segmentation, all 8 scoring functions, expansion scorers.       |
| `analysis/` | Mock pose determinism, pseudo-3D lifter, contact detection, support polygon, wall-detection gate. |
| `storage/`  | User/route/session round-trips through `inMemoryDb`.                  |
| `viz/`      | Fading-segment helper + overlay geometry.                             |

Run: `npm test` (Jest, Node, no native deps) or `npm run test:ci`
(with coverage).

---

## 11. Known limitations (V1)

- Pseudo-3D depths are scale-ambiguous and camera-angle sensitive;
  overhang climbing violates the "elbows/knees bow away from wall" prior.
- Hold tagging is single-frame; holds cannot be repositioned across
  frames (acceptable when the camera is mostly static — tripod use).
- `MockPoseProvider` does not look at video pixels; it emits a
  synthesized realistic motion trace. Real inference is one dev build away.
- Stylized body mesh is a capsule/box approximation, not a
  parametric body model.
- No cloud sync, no auth, no social features.

---

## 12. Roadmap

- Finish `TFJSPoseProvider` (MoveNet Lightning) on a dev build.
- Real SMPL fit for the body mesh panel via a pluggable
  `BodyMeshProvider`; keep the stylized mesh as fallback.
- Multi-frame hold tagging + optional auto-detection (YOLO fine-tune).
- Optional cloud sync behind a feature flag — storage layer already
  factored to accept a remote adapter without touching screens.
- Tutor mode: coach walks through a flagged mistake frame-by-frame.

---

## 13. Glossary

- **CoM** — Center of mass, derived from the lifted 3D skeleton.
- **Support polygon** — Convex hull of contact points (hands & feet on
  holds), projected to the wall plane.
- **Flag** — A free leg extended laterally to counterbalance an
  off-center reach.
- **Match** — Two limbs sharing a single hold.
- **Dyno** — A dynamic move where the climber leaves all contacts
  briefly to catch a target hold.
- **Lift confidence** — Scalar in `[0, 1]` summarizing how well the
  pseudo-3D priors held over the clip.

---

## 14. References

- [`README.md`](../README.md) — install, run, demo walkthrough.
- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — module layering and data flow.
- [`docs/DATA_MODEL.md`](./DATA_MODEL.md) — entity schemas and SQLite layout.
- [`AGENTS.md`](../AGENTS.md) — invariants for AI agents extending this repo.
