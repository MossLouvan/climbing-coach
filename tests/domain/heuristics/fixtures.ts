import {
  JOINT_INDEX,
  JOINT_NAMES,
  makeId,
  type AnalyticsTrack,
  type FrameAnalytics,
  type Hold,
  type HoldId,
  type Joint3D,
  type Keypoint2D,
  type MovementPhase,
  type PhaseKind,
  type Pose2D,
  type Pose3D,
  type PoseTrack,
  type RouteId,
} from '@domain/models';

/**
 * Tiny fixture helpers for heuristic scorer tests. Inline, dependency-
 * free builders for a well-posed 2D skeleton + optional 3D lift + a
 * simple analytics track.
 */

export const RID = makeId<'Route'>('r_test') as RouteId;

export function HID(suffix: string): HoldId {
  return makeId<'Hold'>(suffix) as HoldId;
}

export function kp(x: number, y: number, confidence = 0.9): Keypoint2D {
  return { x, y, confidence };
}

export function joint3(
  x: number,
  y: number,
  z: number,
  confidence = 0.9,
): Joint3D {
  return { x, y, z, confidence };
}

/**
 * Build a plausible climbing pose given hip / foot / shoulder anchors.
 * Everything else (wrists, elbows, nose, knees) is derived.
 */
export function buildPose2D(
  frame: number,
  timestampMs: number,
  opts: {
    hip: { x: number; y: number };
    foot: { x: number; y: number };
    shoulder: { x: number; y: number };
    leftWrist?: { x: number; y: number };
    rightWrist?: { x: number; y: number };
    leftAnkle?: { x: number; y: number };
    rightAnkle?: { x: number; y: number };
  },
): Pose2D {
  const kps: Keypoint2D[] = JOINT_NAMES.map(() => kp(0.5, 0.5, 0.9));
  const { hip, foot, shoulder } = opts;
  kps[JOINT_INDEX.left_hip] = kp(hip.x - 0.02, hip.y);
  kps[JOINT_INDEX.right_hip] = kp(hip.x + 0.02, hip.y);
  kps[JOINT_INDEX.left_shoulder] = kp(shoulder.x - 0.06, shoulder.y);
  kps[JOINT_INDEX.right_shoulder] = kp(shoulder.x + 0.06, shoulder.y);
  const la = opts.leftAnkle ?? { x: foot.x - 0.1, y: foot.y };
  const ra = opts.rightAnkle ?? { x: foot.x + 0.1, y: foot.y };
  kps[JOINT_INDEX.left_ankle] = kp(la.x, la.y);
  kps[JOINT_INDEX.right_ankle] = kp(ra.x, ra.y);
  kps[JOINT_INDEX.left_knee] = kp(hip.x - 0.08, (hip.y + foot.y) / 2);
  kps[JOINT_INDEX.right_knee] = kp(hip.x + 0.08, (hip.y + foot.y) / 2);
  const lw = opts.leftWrist ?? { x: shoulder.x - 0.12, y: shoulder.y - 0.1 };
  const rw = opts.rightWrist ?? { x: shoulder.x + 0.12, y: shoulder.y - 0.1 };
  kps[JOINT_INDEX.left_wrist] = kp(lw.x, lw.y);
  kps[JOINT_INDEX.right_wrist] = kp(rw.x, rw.y);
  kps[JOINT_INDEX.left_elbow] = kp(
    (shoulder.x + lw.x) / 2,
    (shoulder.y + lw.y) / 2,
  );
  kps[JOINT_INDEX.right_elbow] = kp(
    (shoulder.x + rw.x) / 2,
    (shoulder.y + rw.y) / 2,
  );
  kps[JOINT_INDEX.nose] = kp(shoulder.x, shoulder.y - 0.1);
  return { frame, timestampMs, keypoints: kps, score: 0.9 };
}

export function buildPose3D(
  frame: number,
  timestampMs: number,
  hipZ: number,
  liftConfidence = 0.9,
): Pose3D {
  const joints: Joint3D[] = JOINT_NAMES.map(() => joint3(0, 0, 0, 0.9));
  joints[JOINT_INDEX.left_hip] = joint3(-0.1, 0, hipZ);
  joints[JOINT_INDEX.right_hip] = joint3(0.1, 0, hipZ);
  joints[JOINT_INDEX.left_shoulder] = joint3(-0.2, 0.5, hipZ);
  joints[JOINT_INDEX.right_shoulder] = joint3(0.2, 0.5, hipZ);
  joints[JOINT_INDEX.left_ankle] = joint3(-0.1, -1.0, hipZ);
  joints[JOINT_INDEX.right_ankle] = joint3(0.1, -1.0, hipZ);
  joints[JOINT_INDEX.left_knee] = joint3(-0.1, -0.5, hipZ);
  joints[JOINT_INDEX.right_knee] = joint3(0.1, -0.5, hipZ);
  joints[JOINT_INDEX.left_wrist] = joint3(-0.3, 0.9, hipZ);
  joints[JOINT_INDEX.right_wrist] = joint3(0.3, 0.9, hipZ);
  joints[JOINT_INDEX.left_elbow] = joint3(-0.25, 0.7, hipZ);
  joints[JOINT_INDEX.right_elbow] = joint3(0.25, 0.7, hipZ);
  joints[JOINT_INDEX.nose] = joint3(0, 0.7, hipZ);
  return { frame, timestampMs, joints, liftConfidence };
}

export function makeTrack(
  poses2D: Pose2D[],
  poses3D: Pose3D[] = [],
  fps = 30,
): PoseTrack {
  return {
    fps,
    widthPx: 1080,
    heightPx: 1920,
    poses2D,
    poses3D,
    source: 'mock',
  };
}

export function makePhase(
  kind: PhaseKind,
  startFrame: number,
  endFrame: number,
  opts: {
    supportingHoldIds?: ReadonlyArray<HoldId>;
    targetHoldIds?: ReadonlyArray<HoldId>;
    fps?: number;
  } = {},
): MovementPhase {
  const fps = opts.fps ?? 30;
  return {
    kind,
    startFrame,
    endFrame,
    startMs: Math.round((startFrame / fps) * 1000),
    endMs: Math.round((endFrame / fps) * 1000),
    supportingHoldIds: opts.supportingHoldIds ?? [],
    targetHoldIds: opts.targetHoldIds ?? [],
  };
}

export function makeAnalytics(
  frames: Array<Partial<FrameAnalytics> & { frame: number; timestampMs: number }>,
  fps = 30,
): AnalyticsTrack {
  const perFrame: FrameAnalytics[] = frames.map((f) => ({
    frame: f.frame,
    timestampMs: f.timestampMs,
    com2D: f.com2D ?? { x: 0.5, y: 0.5 },
    hip2D: f.hip2D ?? { x: 0.5, y: 0.55 },
    comInsideSupport: f.comInsideSupport ?? true,
    bodySwingDegPerSec: f.bodySwingDegPerSec ?? 0,
    confidence: f.confidence ?? 0.9,
    ...(f.com3D ? { com3D: f.com3D } : {}),
    ...(f.hipToWallMeters !== undefined
      ? { hipToWallMeters: f.hipToWallMeters }
      : {}),
  }));
  return { fps, perFrame };
}

export function footHold(id: string, x: number, y: number): Hold {
  return {
    id: HID(id),
    routeId: RID,
    position: { x, y },
    radius: 0.05,
    type: 'foot_chip',
    role: 'foot_only',
    intendedLimb: 'either',
  };
}

export function handHold(id: string, x: number, y: number): Hold {
  return {
    id: HID(id),
    routeId: RID,
    position: { x, y },
    radius: 0.05,
    type: 'jug',
    role: 'intermediate',
    intendedLimb: 'either',
  };
}
