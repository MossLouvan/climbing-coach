import { buildAnalyticsTrack } from '@analysis/kinematics';
import {
  JOINT_INDEX,
  JOINT_NAMES,
  makeId,
  type AnalyticsTrack,
  type Hold,
  type HoldId,
  type Joint3D,
  type Keypoint2D,
  type MovementPhase,
  type Pose2D,
  type Pose3D,
  type PoseTrack,
  type RouteId,
} from '@domain/models';

// ─── synthetic pose construction ────────────────────────────────────────────

const RID = makeId<'Route'>('r1') as RouteId;
const HID = (s: string) => makeId<'Hold'>(s) as HoldId;

function kp(x: number, y: number, c = 0.9): Keypoint2D {
  return { x, y, confidence: c };
}

function joint3(x: number, y: number, z: number, c = 0.9): Joint3D {
  return { x, y, z, confidence: c };
}

/** A plausible climbing pose with explicit hip + foot + shoulder positions. */
function buildPose2D(
  frame: number,
  timestampMs: number,
  opts: {
    hip: { x: number; y: number };
    foot: { x: number; y: number };
    shoulder: { x: number; y: number };
  },
): Pose2D {
  const kps: Keypoint2D[] = JOINT_NAMES.map(() => kp(0.5, 0.5, 0.9));
  const { hip, foot, shoulder } = opts;
  // Spread hips/shoulders slightly so the midpoints match `hip`/`shoulder`.
  kps[JOINT_INDEX.left_hip] = kp(hip.x - 0.02, hip.y);
  kps[JOINT_INDEX.right_hip] = kp(hip.x + 0.02, hip.y);
  kps[JOINT_INDEX.left_shoulder] = kp(shoulder.x - 0.06, shoulder.y);
  kps[JOINT_INDEX.right_shoulder] = kp(shoulder.x + 0.06, shoulder.y);
  kps[JOINT_INDEX.left_ankle] = kp(foot.x - 0.1, foot.y);
  kps[JOINT_INDEX.right_ankle] = kp(foot.x + 0.1, foot.y);
  kps[JOINT_INDEX.left_knee] = kp(hip.x - 0.08, (hip.y + foot.y) / 2);
  kps[JOINT_INDEX.right_knee] = kp(hip.x + 0.08, (hip.y + foot.y) / 2);
  kps[JOINT_INDEX.left_wrist] = kp(shoulder.x - 0.12, shoulder.y - 0.1);
  kps[JOINT_INDEX.right_wrist] = kp(shoulder.x + 0.12, shoulder.y - 0.1);
  kps[JOINT_INDEX.left_elbow] = kp(shoulder.x - 0.1, shoulder.y - 0.05);
  kps[JOINT_INDEX.right_elbow] = kp(shoulder.x + 0.1, shoulder.y - 0.05);
  kps[JOINT_INDEX.nose] = kp(shoulder.x, shoulder.y - 0.1);
  return { frame, timestampMs, keypoints: kps, score: 0.9 };
}

function emptyTrack(): PoseTrack {
  return {
    fps: 30,
    widthPx: 1080,
    heightPx: 1920,
    poses2D: [],
    poses3D: [],
    source: 'mock',
  };
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('buildAnalyticsTrack', () => {
  it('returns an empty track without throwing on an empty pose track', () => {
    const out = buildAnalyticsTrack(emptyTrack(), [], []);
    expect(out.perFrame).toEqual([]);
    expect(out.fps).toBe(30);
  });

  it('reports comInsideSupport=true when hips sit between feet and 3+ support holds', () => {
    // Three support holds forming a wide triangle around the hip position.
    const holdA: Hold = {
      id: HID('h_a'),
      routeId: RID,
      position: { x: 0.3, y: 0.9 },
      radius: 0.05,
      type: 'foot_chip',
      role: 'foot_only',
      intendedLimb: 'left_foot',
    };
    const holdB: Hold = {
      id: HID('h_b'),
      routeId: RID,
      position: { x: 0.7, y: 0.9 },
      radius: 0.05,
      type: 'foot_chip',
      role: 'foot_only',
      intendedLimb: 'right_foot',
    };
    const holdC: Hold = {
      id: HID('h_c'),
      routeId: RID,
      position: { x: 0.5, y: 0.1 },
      radius: 0.05,
      type: 'jug',
      role: 'start',
      intendedLimb: 'either',
    };
    const pose = buildPose2D(0, 0, {
      hip: { x: 0.5, y: 0.55 },
      foot: { x: 0.5, y: 0.9 },
      shoulder: { x: 0.5, y: 0.3 },
    });
    const phase: MovementPhase = {
      kind: 'setup',
      startFrame: 0,
      endFrame: 0,
      startMs: 0,
      endMs: 0,
      supportingHoldIds: [holdA.id, holdB.id, holdC.id],
      targetHoldIds: [],
    };
    const track: PoseTrack = {
      ...emptyTrack(),
      poses2D: [pose],
    };
    const out = buildAnalyticsTrack(track, [phase], [holdA, holdB, holdC]);
    expect(out.perFrame).toHaveLength(1);
    expect(out.perFrame[0].comInsideSupport).toBe(true);
  });

  it('reports bodySwingDegPerSec > 0 when hips swing while feet stay anchored', () => {
    // Feet fixed at x=0.5, hips move from 0.4 → 0.6 over 3 frames at 30 fps.
    // Shoulders stay above hips so shoulder→hip vector rotates.
    const shoulder = { x: 0.5, y: 0.3 };
    const foot = { x: 0.5, y: 0.9 };
    const dtMs = 1000 / 30;
    const poses2D: Pose2D[] = [
      buildPose2D(0, 0, { hip: { x: 0.4, y: 0.55 }, foot, shoulder }),
      buildPose2D(1, dtMs, { hip: { x: 0.5, y: 0.55 }, foot, shoulder }),
      buildPose2D(2, dtMs * 2, { hip: { x: 0.6, y: 0.55 }, foot, shoulder }),
    ];
    const track: PoseTrack = { ...emptyTrack(), poses2D };
    const out = buildAnalyticsTrack(track, [], []);
    // The first frame seeds prev state so its swing is 0; frames 1 and 2
    // must register non-zero angular velocity.
    expect(out.perFrame[0].bodySwingDegPerSec).toBe(0);
    expect(Math.abs(out.perFrame[1].bodySwingDegPerSec)).toBeGreaterThan(0);
    expect(Math.abs(out.perFrame[2].bodySwingDegPerSec)).toBeGreaterThan(0);
  });

  it('exposes hipToWallMeters ≈ z when Pose3D provides a constant hip z', () => {
    const shoulder = { x: 0.5, y: 0.3 };
    const foot = { x: 0.5, y: 0.9 };
    const hip = { x: 0.5, y: 0.55 };
    const poses2D: Pose2D[] = [
      buildPose2D(0, 0, { hip, foot, shoulder }),
      buildPose2D(1, 33.3, { hip, foot, shoulder }),
    ];
    const makePose3D = (frame: number, timestampMs: number): Pose3D => {
      const joints: Joint3D[] = JOINT_NAMES.map(() => joint3(0, 0, 0, 0.9));
      joints[JOINT_INDEX.left_hip] = joint3(-0.1, 0, 0.3, 0.9);
      joints[JOINT_INDEX.right_hip] = joint3(0.1, 0, 0.3, 0.9);
      joints[JOINT_INDEX.left_shoulder] = joint3(-0.2, 0.5, 0.3, 0.9);
      joints[JOINT_INDEX.right_shoulder] = joint3(0.2, 0.5, 0.3, 0.9);
      joints[JOINT_INDEX.left_ankle] = joint3(-0.1, -1.0, 0.3, 0.9);
      joints[JOINT_INDEX.right_ankle] = joint3(0.1, -1.0, 0.3, 0.9);
      return { frame, timestampMs, joints, liftConfidence: 0.9 };
    };
    const track: PoseTrack = {
      ...emptyTrack(),
      poses2D,
      poses3D: [makePose3D(0, 0), makePose3D(1, 33.3)],
    };
    const out = buildAnalyticsTrack(track, [], []);
    for (const f of out.perFrame) {
      expect(f.hipToWallMeters).toBeDefined();
      expect(f.hipToWallMeters!).toBeCloseTo(0.3, 5);
      expect(f.com3D).toBeDefined();
    }
  });

  it('leaves hipToWallMeters/com3D undefined when Pose3D is missing', () => {
    const pose = buildPose2D(0, 0, {
      hip: { x: 0.5, y: 0.55 },
      foot: { x: 0.5, y: 0.9 },
      shoulder: { x: 0.5, y: 0.3 },
    });
    const track: PoseTrack = { ...emptyTrack(), poses2D: [pose] };
    const out = buildAnalyticsTrack(track, [], []);
    expect(out.perFrame[0].hipToWallMeters).toBeUndefined();
    expect(out.perFrame[0].com3D).toBeUndefined();
    // No NaN sneaks through.
    expect(Number.isFinite(out.perFrame[0].bodySwingDegPerSec)).toBe(true);
    expect(Number.isFinite(out.perFrame[0].com2D.x)).toBe(true);
    expect(Number.isFinite(out.perFrame[0].com2D.y)).toBe(true);
  });

  it('round-trips through JSON serialization preserving analytics fields', () => {
    // Mirrors how the SessionRepository serializes analytics into the
    // report envelope. We don't need sqlite for this — just prove the
    // AnalyticsTrack shape survives JSON.stringify/parse.
    const pose = buildPose2D(0, 0, {
      hip: { x: 0.5, y: 0.55 },
      foot: { x: 0.5, y: 0.9 },
      shoulder: { x: 0.5, y: 0.3 },
    });
    const track: PoseTrack = { ...emptyTrack(), poses2D: [pose] };
    const analytics = buildAnalyticsTrack(track, [], []);
    const envelope = { schema: 'report-envelope@1', analytics };
    const rehydrated = JSON.parse(JSON.stringify(envelope)) as {
      analytics: AnalyticsTrack;
    };
    expect(rehydrated.analytics).toEqual(analytics);
  });
});
