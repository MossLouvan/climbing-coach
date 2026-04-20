import { projectHold, trackCameraMotion } from '@analysis/holds/tracker';
import {
  JOINT_INDEX,
  JOINT_NAMES,
  makeId,
  type Hold,
  type HoldId,
  type Keypoint2D,
  type Pose2D,
  type PoseTrack,
  type RouteId,
} from '@domain/models';

function kp(x: number, y: number, c = 0.9): Keypoint2D {
  return { x, y, confidence: c };
}

function emptyPose(frame: number): Pose2D {
  return {
    frame,
    timestampMs: frame * 100,
    keypoints: JOINT_NAMES.map(() => kp(0.5, 0.5, 0.9)),
    score: 0.9,
  };
}

function setKp(pose: Pose2D, idx: number, point: Keypoint2D): Pose2D {
  const kps = pose.keypoints.slice() as Keypoint2D[];
  kps[idx] = point;
  return { ...pose, keypoints: kps };
}

/**
 * Build a Pose2D whose shoulders+hips sit at the given offsets around the
 * reference anchor centre. Arms/legs are intentionally placed far off
 * so they would pollute tracking if the algorithm picked them up.
 */
function makeAnchoredPose(
  frame: number,
  anchorCenter: { x: number; y: number },
  anchorHalfWidth: number,
  anchorHalfHeight: number,
  confidence = 0.9,
): Pose2D {
  let pose = emptyPose(frame);
  // shoulders: x ± halfWidth, y = center.y - halfHeight
  pose = setKp(
    pose,
    JOINT_INDEX.left_shoulder,
    kp(anchorCenter.x - anchorHalfWidth, anchorCenter.y - anchorHalfHeight, confidence),
  );
  pose = setKp(
    pose,
    JOINT_INDEX.right_shoulder,
    kp(anchorCenter.x + anchorHalfWidth, anchorCenter.y - anchorHalfHeight, confidence),
  );
  // hips: x ± halfWidth, y = center.y + halfHeight
  pose = setKp(
    pose,
    JOINT_INDEX.left_hip,
    kp(anchorCenter.x - anchorHalfWidth, anchorCenter.y + anchorHalfHeight, confidence),
  );
  pose = setKp(
    pose,
    JOINT_INDEX.right_hip,
    kp(anchorCenter.x + anchorHalfWidth, anchorCenter.y + anchorHalfHeight, confidence),
  );
  // arms/legs: deliberately noisy but low-importance — set to wildly
  // different positions to confirm the tracker ignores them
  pose = setKp(pose, JOINT_INDEX.left_wrist, kp(0.05, 0.95, 0.9));
  pose = setKp(pose, JOINT_INDEX.right_wrist, kp(0.95, 0.05, 0.9));
  pose = setKp(pose, JOINT_INDEX.left_ankle, kp(0.05, 0.05, 0.9));
  pose = setKp(pose, JOINT_INDEX.right_ankle, kp(0.95, 0.95, 0.9));
  return pose;
}

function poseTrackOf(poses: ReadonlyArray<Pose2D>): PoseTrack {
  return {
    fps: 10,
    widthPx: 1080,
    heightPx: 1920,
    poses2D: poses,
    poses3D: [],
    source: 'mock',
  };
}

const RID = makeId<'Route'>('r1') as RouteId;
const HID = (s: string) => makeId<'Hold'>(s) as HoldId;

function makeHold(position: { x: number; y: number }, anchorFrame?: number): Hold {
  return {
    id: HID(`h_${position.x}_${position.y}`),
    routeId: RID,
    position,
    radius: 0.04,
    type: 'jug',
    role: 'intermediate',
    ...(anchorFrame !== undefined ? { anchorFrame } : {}),
  };
}

describe('trackCameraMotion', () => {
  it('recovers pure translation when shoulders+hips shift uniformly', () => {
    // 10 frames. Frame N: centre = (0.5 + 0.01*N, 0.5). Width/height constant.
    const poses: Pose2D[] = [];
    for (let f = 0; f < 10; f++) {
      poses.push(makeAnchoredPose(f, { x: 0.5 + 0.01 * f, y: 0.5 }, 0.1, 0.15));
    }
    const track = trackCameraMotion(poseTrackOf(poses), { referenceFrame: 0 });
    expect(track.confident).toBe(true);
    expect(track.perFrame).toHaveLength(10);
    // Frame 5: tx ≈ 0.05
    const f5 = track.perFrame.find((f) => f.frame === 5);
    expect(f5).toBeDefined();
    expect(f5!.tx).toBeCloseTo(0.05, 2);
    expect(f5!.ty).toBeCloseTo(0, 2);
    expect(f5!.scale).toBeCloseTo(1, 2);
    // A hold captured on frame 0 should project to frame 5 with +0.05 offset.
    const hold = makeHold({ x: 0.3, y: 0.4 }, 0);
    const projected = projectHold(hold, 5, track);
    expect(projected).not.toBeNull();
    expect(projected!.x).toBeCloseTo(0.35, 2);
    expect(projected!.y).toBeCloseTo(0.4, 2);
  });

  it('projects a hold captured on frame 0 forward with a +0.1 x-shift over 10 frames', () => {
    // Shoulders+hips translate +0.1 over 10 frames (frames 0..10).
    const poses: Pose2D[] = [];
    for (let f = 0; f <= 10; f++) {
      poses.push(makeAnchoredPose(f, { x: 0.5 + 0.01 * f, y: 0.5 }, 0.1, 0.15));
    }
    const track = trackCameraMotion(poseTrackOf(poses), { referenceFrame: 0 });
    const hold = makeHold({ x: 0.3, y: 0.4 }, 0);
    const projected = projectHold(hold, 10, track);
    expect(projected).not.toBeNull();
    expect(projected!.x).toBeCloseTo(0.4, 2);
    expect(projected!.y).toBeCloseTo(0.4, 2);
  });

  it('recovers a scale change when shoulders widen by 20%', () => {
    // Frame 0: half-width 0.1. Frame 5: half-width 0.12 (20% wider).
    const poses: Pose2D[] = [];
    for (let f = 0; f <= 5; f++) {
      const scale = 1 + 0.04 * f; // 1.0..1.2
      poses.push(makeAnchoredPose(f, { x: 0.5, y: 0.5 }, 0.1 * scale, 0.15 * scale));
    }
    const track = trackCameraMotion(poseTrackOf(poses), { referenceFrame: 0 });
    expect(track.confident).toBe(true);
    const f5 = track.perFrame.find((f) => f.frame === 5);
    expect(f5!.scale).toBeCloseTo(1.2, 1);
  });

  it('marks track as not confident when pose confidence is all zero', () => {
    const poses: Pose2D[] = [];
    for (let f = 0; f < 5; f++) {
      poses.push(makeAnchoredPose(f, { x: 0.5, y: 0.5 }, 0.1, 0.15, 0));
    }
    const track = trackCameraMotion(poseTrackOf(poses), { referenceFrame: 0 });
    expect(track.confident).toBe(false);
    // Still returns identity transforms so callers can fall back safely.
    expect(track.perFrame).toHaveLength(5);
    for (const f of track.perFrame) {
      expect(f.tx).toBe(0);
      expect(f.ty).toBe(0);
      expect(f.scale).toBe(1);
    }
  });

  it('does not throw on an empty pose track', () => {
    const track = trackCameraMotion(poseTrackOf([]), { referenceFrame: 0 });
    expect(track.perFrame).toEqual([]);
    expect(track.confident).toBe(false);
  });
});

describe('projectHold', () => {
  function buildTranslatingTrack(
    frames: number,
    dxPerFrame: number,
    referenceFrame = 0,
  ) {
    const poses: Pose2D[] = [];
    for (let f = 0; f < frames; f++) {
      poses.push(
        makeAnchoredPose(f, { x: 0.5 + dxPerFrame * f, y: 0.5 }, 0.1, 0.15),
      );
    }
    return trackCameraMotion(poseTrackOf(poses), { referenceFrame });
  }

  it('returns null when the projected scale is absurdly large', () => {
    // Build a track with a forged absurd scale on the target frame.
    const track = buildTranslatingTrack(5, 0);
    const mutated = {
      ...track,
      perFrame: track.perFrame.map((f) =>
        f.frame === 3 ? { ...f, scale: 5 } : f,
      ),
    };
    const hold = makeHold({ x: 0.3, y: 0.4 }, 0);
    const projected = projectHold(hold, 3, mutated);
    expect(projected).toBeNull();
  });

  it('returns null when projection falls far off-screen', () => {
    // Huge translation on target frame → hold gets pushed way off-screen.
    const track = buildTranslatingTrack(5, 0);
    const mutated = {
      ...track,
      perFrame: track.perFrame.map((f) =>
        f.frame === 2 ? { ...f, tx: 2.0 } : f,
      ),
    };
    const hold = makeHold({ x: 0.3, y: 0.4 }, 0);
    const projected = projectHold(hold, 2, mutated);
    expect(projected).toBeNull();
  });

  it('returns identity projection (hold.position) when track is not confident', () => {
    const track = trackCameraMotion(
      poseTrackOf([makeAnchoredPose(0, { x: 0.5, y: 0.5 }, 0.1, 0.15, 0)]),
      { referenceFrame: 0 },
    );
    const hold = makeHold({ x: 0.3, y: 0.4 }, 0);
    const projected = projectHold(hold, 0, track);
    expect(projected).not.toBeNull();
    expect(projected!.x).toBeCloseTo(0.3, 5);
    expect(projected!.y).toBeCloseTo(0.4, 5);
  });

  it('infers anchor frame from capturedAtMs * fps / 1000 when anchorFrame is undefined', () => {
    // 10 fps, capturedAtMs = 500 → anchorFrame = 5.
    const poses: Pose2D[] = [];
    for (let f = 0; f < 11; f++) {
      poses.push(makeAnchoredPose(f, { x: 0.5 + 0.01 * f, y: 0.5 }, 0.1, 0.15));
    }
    const track = trackCameraMotion(poseTrackOf(poses), { referenceFrame: 0 });
    const hold: Hold = {
      id: HID('h_ts'),
      routeId: RID,
      position: { x: 0.3, y: 0.4 },
      radius: 0.04,
      type: 'jug',
      role: 'intermediate',
      capturedAtMs: 500,
    };
    // Hold captured at frame 5 (pose centre +0.05). Project to frame 10
    // (pose centre +0.10) → should land at 0.3 + 0.05 = 0.35.
    // CameraTrack carries fps so the inference can happen without an
    // extra argument.
    const projected = projectHold(hold, 10, track);
    expect(projected).not.toBeNull();
    expect(projected!.x).toBeCloseTo(0.35, 2);
  });
});
