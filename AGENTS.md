# Instructions for Coding Agents

If you are an AI coding agent (Claude Code, Cursor, etc.) picking this
repo up — read this first. It encodes invariants that are easy to
accidentally break.

## The product in one sentence

A local-first iPhone app that analyzes **climbing technique** from a
phone video using interpretable biomechanics, not pro-climber
comparisons.

## Non-negotiable invariants

1. **`src/domain/` must stay dependency-free.** No React, no three, no
   expo, no sqlite, no file I/O. This is what lets scoring run in Node
   tests and later on a server. Adding a `react-native` import to a
   domain file is a red flag.

2. **Real vs approximated must stay labeled.** Three things are
   currently approximations:
   - `MockPoseProvider` (synthetic motion; `isRealInference: false`)
   - `PseudoLifter` (heuristic depth, NOT a learned 3D pose model)
   - The capsule-per-limb body mesh in `Skeleton3D.tsx`
   Each has explicit comments saying so. If you upgrade any of them,
   update the label in code AND in `README.md`'s
   *"What is real vs approximated"* table.

3. **Sessions created by mock inference are badged "Demo" in the UI.**
   If you add new providers, set `isRealInference` correctly.

4. **Pose data is 17-point COCO/MoveNet order.** Keep `JOINT_NAMES`,
   `JOINT_INDEX`, and `SKELETON_BONES` consistent. Downstream code
   indexes by name constants.

5. **Normalized coordinates everywhere at the boundary.** Holds and
   2D keypoints are in `[0, 1]`. Only `PseudoLifter` converts to
   meters (and only internally).

6. **`analyzeSession()` is the only orchestrator.** Don't let screens
   reach into individual analysis modules.

7. **`Database` interface is the only way storage is accessed.** No
   `expo-sqlite` imports outside `src/storage/expoSqliteDb.ts`.

8. **No cloud/auth creep.** V1 is local-first on purpose. If you add a
   sync path, hide it behind a feature flag and keep the offline path
   fully functional.

## Where to make common changes

| Want to…                                | Edit                                                           |
| --------------------------------------- | -------------------------------------------------------------- |
| Add a new scoring category              | `src/domain/models/score.ts` + `src/domain/scoring/heuristics.ts` + `ScoringEngine.aggregateCategories` |
| Add a new phase kind                    | `src/domain/models/phase.ts` + `segmentPhases.ts` + `phaseColor()` |
| Plug in real pose inference             | `src/analysis/pose/TFJSPoseProvider.ts` (only; everything else adapts) |
| Replace the stylized body mesh          | `src/viz/skeleton3d/Skeleton3D.tsx` (introduce a `BodyMeshProvider` interface) |
| Add a new table                         | `src/storage/schema.ts` + new repository + `makeRepositories()` wiring |
| Add a new screen                        | `src/app/screens/` + register in `RootNavigator.tsx`           |

## Rules of thumb

- Prefer editing existing files over creating new ones.
- Keep files under ~400 lines; extract helpers rather than widening.
- All 2D UI colors come from `src/app/theme/tokens.ts`.
- Don't comment WHAT code does; only WHY, when the why is non-obvious
  or a climbing-specific heuristic.
- Don't add dependencies for one-liners. `three` and `react-native-svg`
  already cover our viz; `zustand` covers state.
- Run `npm run typecheck && npm test` before committing.

## Coverage / test expectations

Minimum coverage thresholds (jest config): 60% lines, 50% branches.
Current coverage is ~75% statements. New *domain* / *analysis* code
should come with tests. UI and viz code is exempt — we don't render
these in Node.

## When you're stuck on a climbing rule

The coaching heuristics are derived from:

- center of mass relative to support (a staple of climbing coaching)
- hips-close-to-wall / under-the-hold cues
- flagging as counterbalance
- dynamic-move "stick the catch" control
- jerk-minimal setup positions
- direct-line reaches

If you're adding a new rule, write it as a pure function in
`src/domain/scoring/heuristics.ts` that returns `{ score, rationale }`
and bolt it into `ScoringEngine` with a weight. Don't sneak climbing
rules into the phase segmenter — that's for *what is happening*, not
*how well*.
