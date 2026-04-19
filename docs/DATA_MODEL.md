# Data Model

All domain types live in `src/domain/models/`. The app is local-first
today; the same schema is designed to be uploadable to a server later
without restructuring.

## Entities

### User
```ts
{
  id: UserId,
  displayName: string,
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert',
  heightM?: number,          // used for anthropometric 3D lift
  dominantHand: 'left' | 'right',
  createdAtMs: Timestamp,
}
```

### Route
```ts
{
  id: RouteId,
  name: string,
  grade?: { system: 'V' | 'YDS' | 'Font' | 'custom', value: number | string },
  holds: Hold[],
  sequence: RouteSequenceStep[],
  description?: string,
}
```

### Hold
```ts
{
  id: HoldId,
  routeId: RouteId,
  position: { x: number, y: number },   // normalized image coords [0,1]
  radius: number,                       // normalized
  type: 'jug' | 'crimp' | 'pinch' | 'sloper' | 'pocket' | 'foot_chip' | 'volume' | 'unknown',
  role: 'start' | 'intermediate' | 'finish' | 'foot_only',
  intendedLimb?: 'left_hand' | 'right_hand' | 'left_foot' | 'right_foot' | 'either',
  label?: string,
}
```

### RouteSequenceStep
```ts
{ order: number, holdId: HoldId, limb: '...'|..., note?: string }
```

### Video
```ts
{
  id: VideoId,
  uri: string,                 // expo-file-system / asset URI
  durationMs: number,
  widthPx: number,
  heightPx: number,
  fps: number,
  thumbnailUri?: string,
  sizeBytes?: number,
}
```

### Session
```ts
{
  id: SessionId,
  userId: UserId,
  routeId: RouteId,
  video: Video,
  source: 'live_recording' | 'upload',
  status: 'draft' | 'tagged' | 'analyzing' | 'analyzed' | 'failed',
  createdAtMs: Timestamp,
  note?: string,
  phases?: MovementPhase[],
  poseTrack?: PoseTrack,
  report?: TechniqueReport,
}
```

### Pose2D / Pose3D
Fixed-length 17-keypoint arrays aligned with `JOINT_NAMES`
(COCO / MoveNet layout). `Pose3D.joints[i]` corresponds to
`Pose2D.keypoints[i]`.

### PoseTrack
```ts
{ fps, widthPx, heightPx, poses2D: Pose2D[], poses3D: Pose3D[] }
```

### MovementPhase
```ts
{
  kind: 'setup' | 'weight_shift' | 'reach' | 'dyno' | 'match' | 'flag' | 'rest',
  startFrame, endFrame, startMs, endMs,
  supportingHoldIds: HoldId[],
  targetHoldIds: HoldId[],
}
```

### TechniqueReport
```ts
{
  overall: number,                           // 0..100
  byCategory: Record<ScoreCategory, number>, // 8 categories
  phaseScores: PhaseScore[],
  tips: CoachingTip[],
  caveats: string[],
  generatedAtMs: Timestamp,
}
```

## SQLite schema (v1)

See `src/storage/schema.ts`. Heavy artifacts (`poseTrack`, `phases`,
`report`, plus `holds` and `sequence`) are stored as JSON blobs in
TEXT columns because they are always read whole and never queried
internally.

Foreign keys are enforced (`PRAGMA foreign_keys = ON`). Cascade rules:

- delete a user → their sessions are deleted
- delete a video → its session is deleted
- delete a route → **RESTRICT** (protect orphaned sessions)

## ID conventions

All IDs are opaque branded strings. Generate them client-side
(`makeId<'Session'>('ses_' + nanoid())`) so they remain stable when a
future sync backend is added.

## Normalized coordinates

All 2D positions (hold centers, keypoints) are stored in `[0, 1]`
normalized image space with origin top-left. The pipeline converts to
meters inside `PseudoLifter` using the per-session pixel-per-meter
estimate.

## What is *not* persisted

- Raw frame images — the video URI is enough. We regenerate thumbnails
  on demand.
- Intermediate analysis state (progress events, partial pose tracks).
- User credentials — V1 has no auth.
