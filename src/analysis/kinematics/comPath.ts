import type {
  AnalyticsTrack,
  FrameAnalytics,
  Hold,
  HoldId,
  MovementPhase,
  NormalizedPoint2D,
  Pose2D,
  Pose3D,
  PoseTrack,
} from '@domain/models';
import { JOINT_INDEX } from '@domain/models';

import { centerOfMass2D, centerOfMass3D } from './centerOfMass';

/**
 * Builds a per-frame analytics track from the pose track, the phase
 * timeline, and the tagged holds.
 *
 * Downstream features (scoring, overlays) read this instead of
 * recomputing CoM / balance tests. Every field is bounded and non-NaN
 * even for empty/degenerate inputs.
 *
 * Notes on each derived field:
 *  - com2D:       mass-weighted body CoM in normalized image coords.
 *  - com3D:       mass-weighted body CoM when a Pose3D lift is available
 *                 for this frame. Matched by (frame, timestamp).
 *  - hip2D:       midpoint of left+right hip keypoints (normalized).
 *  - hipToWall:   z-component of the hip midpoint in meters, when 3D is
 *                 available. Our +z convention is "toward camera / away
 *                 from wall", so we return |z| as an approximate
 *                 "distance from wall". Undefined when no 3D lift exists.
 *  - comInsideSupport:
 *                 true when the phase's supportingHoldIds form a convex
 *                 polygon (>=3) that contains com2D. Falls back to true
 *                 for fewer than 3 support holds (insufficient data —
 *                 don't punish the climber for our limitation).
 *  - bodySwingDegPerSec:
 *                 signed angular velocity of the torso vector (shoulder
 *                 midpoint → hip midpoint). Positive = rotating right.
 *                 Unwrapped across ±π so a frame-to-frame sign flip
 *                 doesn't produce a bogus 360°/frame spike.
 *  - confidence:  min of shoulders + hips keypoint confidences. These
 *                 are the joints that dominate every analytics field.
 */
export function buildAnalyticsTrack(
  poseTrack: PoseTrack,
  phases: ReadonlyArray<MovementPhase>,
  holds: ReadonlyArray<Hold>,
): AnalyticsTrack {
  const fps = poseTrack.fps > 0 ? poseTrack.fps : 30;
  const poses2D = poseTrack.poses2D;
  if (poses2D.length === 0) {
    return { fps, perFrame: [] };
  }

  const poses3DByFrame = indexPoses3DByFrame(poseTrack.poses3D);
  const holdsById = new Map<HoldId, Hold>(holds.map((h) => [h.id, h]));
  const supportPolygonCache = new Map<number, ReadonlyArray<NormalizedPoint2D>>();

  const perFrame: FrameAnalytics[] = [];
  let prevTorsoAngle: number | null = null;
  let prevTimestampMs: number | null = null;

  for (let i = 0; i < poses2D.length; i++) {
    const pose = poses2D[i];
    const pose3D = poses3DByFrame.get(pose.frame);
    const hip2D = hipMidpoint2D(pose);
    const shoulder2D = shoulderMidpoint2D(pose);

    const com2DRaw = centerOfMass2D(pose);
    const com2D: NormalizedPoint2D = {
      x: safeNumber(com2DRaw.x, hip2D.x),
      y: safeNumber(com2DRaw.y, hip2D.y),
    };

    const com3DRaw = pose3D ? centerOfMass3D(pose3D) : undefined;
    const com3D =
      com3DRaw && isFiniteXYZ(com3DRaw)
        ? { x: com3DRaw.x, y: com3DRaw.y, z: com3DRaw.z }
        : undefined;

    const hipToWallMeters = pose3D ? hipToWall(pose3D) : undefined;

    const activePhase = findPhaseForFrame(phases, pose.frame);
    const polygon = activePhase
      ? getSupportPolygon(activePhase, holdsById, supportPolygonCache)
      : undefined;
    const comInsideSupport = polygon ? pointInPolygon(com2D, polygon) : true;

    const torsoAngle = angleBetween(shoulder2D, hip2D);
    let bodySwingDegPerSec = 0;
    if (prevTorsoAngle !== null && prevTimestampMs !== null) {
      const dtSec = (pose.timestampMs - prevTimestampMs) / 1000;
      if (dtSec > 0) {
        const dTheta = unwrap(torsoAngle - prevTorsoAngle);
        bodySwingDegPerSec = (dTheta * 180) / Math.PI / dtSec;
      }
    }
    prevTorsoAngle = torsoAngle;
    prevTimestampMs = pose.timestampMs;

    perFrame.push({
      frame: pose.frame,
      timestampMs: pose.timestampMs,
      com2D,
      ...(com3D ? { com3D } : {}),
      hip2D,
      ...(hipToWallMeters !== undefined ? { hipToWallMeters } : {}),
      comInsideSupport,
      bodySwingDegPerSec: safeNumber(bodySwingDegPerSec, 0),
      confidence: analyticsConfidence(pose),
    });
  }

  return { fps, perFrame };
}

function indexPoses3DByFrame(poses3D: ReadonlyArray<Pose3D>): Map<number, Pose3D> {
  const map = new Map<number, Pose3D>();
  for (const p of poses3D) map.set(p.frame, p);
  return map;
}

function hipMidpoint2D(pose: Pose2D): NormalizedPoint2D {
  const lh = pose.keypoints[JOINT_INDEX.left_hip];
  const rh = pose.keypoints[JOINT_INDEX.right_hip];
  return { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
}

function shoulderMidpoint2D(pose: Pose2D): NormalizedPoint2D {
  const ls = pose.keypoints[JOINT_INDEX.left_shoulder];
  const rs = pose.keypoints[JOINT_INDEX.right_shoulder];
  return { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
}

function hipToWall(pose3D: Pose3D): number | undefined {
  const lh = pose3D.joints[JOINT_INDEX.left_hip];
  const rh = pose3D.joints[JOINT_INDEX.right_hip];
  if (!lh || !rh) return undefined;
  const z = (lh.z + rh.z) / 2;
  if (!Number.isFinite(z)) return undefined;
  return Math.abs(z);
}

function analyticsConfidence(pose: Pose2D): number {
  const ls = pose.keypoints[JOINT_INDEX.left_shoulder]?.confidence ?? 0;
  const rs = pose.keypoints[JOINT_INDEX.right_shoulder]?.confidence ?? 0;
  const lh = pose.keypoints[JOINT_INDEX.left_hip]?.confidence ?? 0;
  const rh = pose.keypoints[JOINT_INDEX.right_hip]?.confidence ?? 0;
  return Math.min(ls, rs, lh, rh);
}

function findPhaseForFrame(
  phases: ReadonlyArray<MovementPhase>,
  frame: number,
): MovementPhase | undefined {
  for (const p of phases) {
    if (frame >= p.startFrame && frame <= p.endFrame) return p;
  }
  return undefined;
}

function getSupportPolygon(
  phase: MovementPhase,
  holdsById: ReadonlyMap<HoldId, Hold>,
  cache: Map<number, ReadonlyArray<NormalizedPoint2D>>,
): ReadonlyArray<NormalizedPoint2D> | undefined {
  // Cache key is the phase startFrame — phases are unique per (startFrame,
  // kind) in this pipeline so it's a safe identity.
  const key = phase.startFrame;
  if (cache.has(key)) return cache.get(key);

  if (phase.supportingHoldIds.length < 3) {
    cache.set(key, []);
    return undefined;
  }
  const points: NormalizedPoint2D[] = [];
  for (const id of phase.supportingHoldIds) {
    const h = holdsById.get(id);
    if (h) points.push(h.position);
  }
  if (points.length < 3) {
    cache.set(key, []);
    return undefined;
  }
  const hull = convexHull(points);
  cache.set(key, hull);
  return hull.length >= 3 ? hull : undefined;
}

/** Andrew's monotone chain convex hull. Input need not be sorted. */
function convexHull(points: ReadonlyArray<NormalizedPoint2D>): NormalizedPoint2D[] {
  const pts = points
    .slice()
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (pts.length <= 1) return pts;
  const cross = (o: NormalizedPoint2D, a: NormalizedPoint2D, b: NormalizedPoint2D) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: NormalizedPoint2D[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: NormalizedPoint2D[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Ray-casting point-in-polygon test. Edge points count as inside. */
function pointInPolygon(
  p: NormalizedPoint2D,
  polygon: ReadonlyArray<NormalizedPoint2D>,
): boolean {
  if (polygon.length < 3) return true;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function angleBetween(from: NormalizedPoint2D, to: NormalizedPoint2D): number {
  // Angle of the vector from→to in the image plane. y increases downward
  // in normalized image coords, so a climber hanging straight has angle
  // ≈ π/2 (shoulder → hip points down). We don't correct for that here
  // — we only care about *changes* in angle for swing velocity.
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function unwrap(delta: number): number {
  // Wrap raw angular delta into (-π, π] so we never report a frame-to-
  // frame jump bigger than a half-turn.
  let d = delta;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

function isFiniteXYZ(p: { x: number; y: number; z: number }): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

function safeNumber(n: number, fallback: number): number {
  return Number.isFinite(n) ? n : fallback;
}
