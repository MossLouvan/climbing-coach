import {
  JOINT_INDEX,
  JOINT_NAMES,
  makeId,
  type Hold,
  type HoldId,
  type Keypoint2D,
  type MovementPhase,
  type Pose2D,
  type PoseTrack,
  type RouteId,
} from '@domain/models';

/**
 * Test-only pose/track fixtures.
 *
 * We build poses programmatically rather than loading fixture JSON
 * because detectors' thresholds depend on precise joint coordinates
 * — keeping the fixtures in code makes each case auditable.
 */

export const RID = makeId<'Route'>('r_test') as RouteId;
export const HID = (s: string) => makeId<'Hold'>(s) as HoldId;

export function kp(x: number, y: number, c = 0.9): Keypoint2D {
  return { x, y, confidence: c };
}

/**
 * Build a neutral standing pose at normalized hip position (cx, cy).
 * All joints default to reasonable relative positions.
 */
export function neutralPose(
  frame: number,
  timestampMs: number,
  overrides: Partial<Record<number, Keypoint2D>> = {},
  cx = 0.5,
  cy = 0.55,
): Pose2D {
  const kps: Keypoint2D[] = JOINT_NAMES.map(() => kp(cx, cy));
  kps[JOINT_INDEX.nose] = kp(cx, cy - 0.35);
  kps[JOINT_INDEX.left_eye] = kp(cx - 0.02, cy - 0.36);
  kps[JOINT_INDEX.right_eye] = kp(cx + 0.02, cy - 0.36);
  kps[JOINT_INDEX.left_ear] = kp(cx - 0.035, cy - 0.355);
  kps[JOINT_INDEX.right_ear] = kp(cx + 0.035, cy - 0.355);
  kps[JOINT_INDEX.left_shoulder] = kp(cx - 0.09, cy - 0.25);
  kps[JOINT_INDEX.right_shoulder] = kp(cx + 0.09, cy - 0.25);
  kps[JOINT_INDEX.left_elbow] = kp(cx - 0.12, cy - 0.12);
  kps[JOINT_INDEX.right_elbow] = kp(cx + 0.12, cy - 0.12);
  kps[JOINT_INDEX.left_wrist] = kp(cx - 0.14, cy);
  kps[JOINT_INDEX.right_wrist] = kp(cx + 0.14, cy);
  kps[JOINT_INDEX.left_hip] = kp(cx - 0.07, cy);
  kps[JOINT_INDEX.right_hip] = kp(cx + 0.07, cy);
  kps[JOINT_INDEX.left_knee] = kp(cx - 0.08, cy + 0.18);
  kps[JOINT_INDEX.right_knee] = kp(cx + 0.08, cy + 0.18);
  kps[JOINT_INDEX.left_ankle] = kp(cx - 0.09, cy + 0.35);
  kps[JOINT_INDEX.right_ankle] = kp(cx + 0.09, cy + 0.35);

  for (const k of Object.keys(overrides)) {
    const idx = Number(k);
    const v = overrides[idx];
    if (v) kps[idx] = v;
  }
  return { frame, timestampMs, keypoints: kps, score: 0.9 };
}

/** Build a PoseTrack from an array of Pose2D. */
export function makeTrack(poses: ReadonlyArray<Pose2D>, fps = 30): PoseTrack {
  return {
    fps,
    widthPx: 1080,
    heightPx: 1920,
    poses2D: poses,
    poses3D: [],
    source: 'mock',
  };
}

/** Build a sequence of copies of the same pose at `fps` over `durationMs`. */
export function repeatedPoses(
  builder: (frame: number, ms: number) => Pose2D,
  durationMs: number,
  fps: number = 30,
): Pose2D[] {
  const total = Math.max(1, Math.round((durationMs / 1000) * fps));
  const out: Pose2D[] = [];
  for (let i = 0; i < total; i++) {
    const ms = Math.round((i / fps) * 1000);
    out.push(builder(i, ms));
  }
  return out;
}

export function emptyTrack(fps = 30): PoseTrack {
  return makeTrack([], fps);
}

export function phase(
  kind: MovementPhase['kind'],
  startFrame: number,
  endFrame: number,
  fps = 30,
): MovementPhase {
  return {
    kind,
    startFrame,
    endFrame,
    startMs: Math.round((startFrame / fps) * 1000),
    endMs: Math.round((endFrame / fps) * 1000),
    supportingHoldIds: [],
    targetHoldIds: [],
  };
}

export function handHold(id: string, x: number, y: number, radius = 0.05): Hold {
  return {
    id: HID(id),
    routeId: RID,
    position: { x, y },
    radius,
    type: 'jug',
    role: 'intermediate',
  };
}

export function footHold(id: string, x: number, y: number, radius = 0.04): Hold {
  return {
    id: HID(id),
    routeId: RID,
    position: { x, y },
    radius,
    type: 'foot_chip',
    role: 'foot_only',
  };
}
