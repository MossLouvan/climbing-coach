# Architecture

## Layered module boundaries

The repository is split into five layers. Dependencies only flow
**downward**. A violation (e.g. `domain/` importing from `app/`) is a
refactor priority, not a casual fix.

```
 app/  ←  screens, navigation, zustand store, theme    (React Native + Expo)
 viz/  ←  PoseOverlay (SVG), Skeleton3D (expo-gl+three)
─────────────────────────────────────────────────────
 storage/ ← sqlite schema, Database interface, repos, seeds
 analysis/ ← pose providers, pseudo-3D lifter, kinematics, holds
 domain/   ← pure models, phase segmentation, scoring engine
```

`domain/` is **dependency-free**: no React, no three, no expo, no
sqlite. This is what lets the scoring engine, heuristics, and phase
segmenter run in Node tests and later on a server without change.

`analysis/` depends on `domain/` only.
`storage/` depends on `domain/` + an abstract `Database` interface.
`viz/` depends on `domain/` and on `three`/`react-native-svg` only.
`app/` composes everything and is the only layer allowed to import
from Expo/React Native.

## Data flow

```
 Video ─► PoseProvider.infer() ─► Pose2D[]
                                      │
                                      ▼
                              PseudoLifter.lift() ─► Pose3D[]
                                      │
                              PoseTrack { 2D + 3D }
                                      │
                                      ▼
                         segmentPhases(track, holds) ─► MovementPhase[]
                                      │
                                      ▼
                    ScoringEngine.score({ track, phases, route })
                                      │
                                      ▼
                              TechniqueReport
```

`analyzeSession()` in `src/analysis/pipeline.ts` is the single
orchestrator. UI code never calls the sub-modules directly.

## Pose inference

Provider interface lives in `src/analysis/pose/PoseProvider.ts`.

- `MockPoseProvider` — deterministic, seeded motion. Works in Expo Go.
  Sessions produced by it are labeled **Demo** in the UI.
- `TFJSPoseProvider` — stub that fails fast with `NEEDS_DEV_BUILD` when
  native deps aren't present. `resolvePoseProvider(preferReal: true)`
  gracefully falls back. To finish the real wire-up:

  1. `npx expo prebuild --platform ios`
  2. Install `@tensorflow/tfjs`, `@tensorflow/tfjs-react-native`,
     `@tensorflow-models/pose-detection`, `react-native-fs`.
  3. In `TFJSPoseProvider.infer()`, extract frames with
     `react-native-fs` + `expo-video-thumbnails` (one per target frame),
     decode each into a tfjs tensor, run MoveNet Lightning.
  4. Normalize the output to 17 keypoints matching `JOINT_NAMES` — the
     downstream pipeline is already compatible.

Nothing else in the app needs to change when this lands.

## Pseudo-3D lift

`src/analysis/lifting/PseudoLifter.ts`.

What it is:

- Pick a pixels-per-meter scale from the most-confident torso length
  in the clip.
- For each joint pair (parent → child), the 2D projected distance
  plus the expected bone length (from anthropometry) yields an
  absolute depth offset via Pythagoras.
- Sign ambiguity (resolving z toward or away from the wall) is set
  by a climbing prior: elbows/knees bow away from wall; wrists and
  ankles return to z≈wall. Head leans slightly away when looking up.

What it is *not*: a learned monocular 3D pose model. We intentionally
avoid black-box inference here — the coach needs to be able to cite
"hip is ~10cm off the wall" rather than handwave at a neural net.

When overhang geometry breaks the priors, `liftConfidence` drops and
the report surfaces a caveat.

## Phase segmentation

`src/domain/phases/segmentPhases.ts`.

A small rule-based state machine. For each frame we compute:

- number of limbs in contact with tagged holds
- whether any two contacts share the same hold (match)
- flag geometry (feet splayed far beyond hip width)
- CoM velocity relative to prev frame
- hand-contact delta vs. prev frame (release/grip)

We classify into `setup | weight_shift | reach | dyno | match | flag |
rest`, smooth single-frame glitches, and merge adjacent runs into
`MovementPhase[]`. Each phase carries the holds considered
"supporting" (weighted toward feet) and "target" (hands reaching new
holds).

We deliberately don't use ML here. Climbing is too small a domain for
labeled motion data to pay off, and interpretability is worth more
than marginal accuracy.

## Scoring engine

`src/domain/scoring/`.

8 categories:

- `balance` — CoM-x inside support-x column
- `hip_positioning` — hip under active hand hold
- `flagging` — counterbalance usage; penalized when reaches drift
  far off-center without a flag engaged
- `reach_efficiency` — direct-distance / actual hand path length
- `stability` — mean CoM jerk in setup/rest phases
- `dynamic_control` — post-catch horizontal swing
- `smoothness` — mean CoM jerk over the whole clip
- `route_adherence` — actual vs. intended hold sequence

Every heuristic is a pure function that returns `{ score, rationale }`.
Scores clamp to [0, 100]. The engine composes per-phase scores with
configurable weights and emits per-phase + global coaching tips with
severities.

## Storage

Interface: `Database` in `src/storage/db.ts`.

Two adapters:

- `openExpoSqliteDatabase()` — real device via `expo-sqlite`.
- `inMemoryDb()` — tiny purpose-built fake for Node/tests. It parses
  the specific SQL subset this app emits. If a query cannot be
  parsed, it throws loudly rather than silently corrupting state.

Schema v1 tables:

- `users`
- `routes` (holds and sequence as JSON blobs — immutable, read-whole)
- `videos` (URIs only; bytes live on disk)
- `sessions` (references user/route/video; phases/pose_track/report
  as JSON blobs)
- `schema_migrations`

Repositories in `src/storage/repositories.ts` expose domain-shaped
operations only. Screens never touch SQL.

## Seeding

`seedDemoData(repos)` is idempotent. It:

1. Inserts a demo user.
2. Inserts the demo route (`DEMO_ROUTE` — 6 holds, 6-step sequence).
3. Runs the *real* `analyzeSession()` pipeline against the mock pose
   provider for that route, stuffs the result into a session, and
   persists it.

So first-launch UX shows a full technique report immediately, and the
scoring pipeline is continuously exercised as part of the seed.

## 3D visualization

`src/viz/skeleton3d/Skeleton3D.tsx`.

Uses `expo-gl` for the surface and `three` for the scene graph. One
`THREE.Scene` is built on context creation and mutated in place each
frame to avoid allocations. Each pose update moves 17 joint spheres
and 12 bone lines to the lifted 3D positions.

The capsule-per-limb body mesh is a **stylized approximation**, not a
parametric body model. It's labeled in source. To upgrade:

1. Add a `BodyMeshProvider` interface that maps 17 joints → a deformed
   triangle mesh.
2. Ship a `StylizedCapsuleProvider` (current behavior) and a
   `SMPLMeshProvider` (real fit, probably via `@tensorflow-models/human`
   or an ONNX export).
3. Swap via runtime feature flag.

## Testing

- `tests/domain/` — phase segmentation, scoring
- `tests/analysis/` — mock pose determinism, pseudo-3D lifter, contact
  detection, support polygon
- `tests/storage/` — user/route/session round-trips through inMemoryDb

Run: `npm test`. CI runs the same `npm test` + `npm run typecheck`.
