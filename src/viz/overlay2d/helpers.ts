/**
 * Pure geometry helpers for the 2D coaching overlays.
 *
 * These functions are deliberately isolated from React / react-native-svg so
 * they can be unit-tested in Node (see `tests/viz/`) without requiring the
 * React Native test renderer.
 */

import {
  JOINT_INDEX,
  type FrameAnalytics,
  type Keypoint2D,
  type NormalizedPoint2D,
  type Pose2D,
  type TechniqueEvent,
  type TechniqueEventKind,
} from '@domain/models';

/** A faded line segment between two points on the [0..1] normalized canvas. */
export interface FadingSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  /** [0..1]. 1 = fully opaque, near the current playhead. */
  readonly opacity: number;
}

/**
 * Build a trail of fading line segments over a time window centered at
 * `currentMs`. Each segment connects two consecutive per-frame points.
 *
 * Opacity rises linearly from `minOpacity` at the window edges to
 * `maxOpacity` at the current playhead, so the trail fades in AND out —
 * matching the "where the climber just was / is about to be" reading.
 *
 * `points` must be sorted by `timestampMs` ascending.
 */
export function computeFadingSegments<P extends { readonly timestampMs: number }>(
  points: ReadonlyArray<P>,
  currentMs: number,
  windowMs: number,
  project: (p: P) => NormalizedPoint2D,
  opts: { readonly minOpacity?: number; readonly maxOpacity?: number } = {},
): FadingSegment[] {
  if (points.length < 2 || windowMs <= 0) return [];
  const minOpacity = opts.minOpacity ?? 0.1;
  const maxOpacity = opts.maxOpacity ?? 0.9;
  const out: FadingSegment[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const midMs = (a.timestampMs + b.timestampMs) / 2;
    const dt = Math.abs(midMs - currentMs);
    if (dt > windowMs) continue;
    const t = 1 - dt / windowMs; // 1 near current, 0 at edges
    const opacity = minOpacity + (maxOpacity - minOpacity) * t;
    const pa = project(a);
    const pb = project(b);
    out.push({ x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, opacity });
  }
  return out;
}

/**
 * Joint angle in degrees at vertex `b` defined by the bone segments
 * a-b and b-c. Returns `null` if any keypoint is below `minConfidence`
 * or if the segments are degenerate (zero-length).
 */
export function jointAngleDeg(
  a: Keypoint2D,
  b: Keypoint2D,
  c: Keypoint2D,
  minConfidence = 0.3,
): number | null {
  if (
    a.confidence < minConfidence ||
    b.confidence < minConfidence ||
    c.confidence < minConfidence
  ) {
    return null;
  }
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const n1 = Math.hypot(v1x, v1y);
  const n2 = Math.hypot(v2x, v2y);
  if (n1 === 0 || n2 === 0) return null;
  const cos = (v1x * v2x + v1y * v2y) / (n1 * n2);
  // Clamp against floating error.
  const clamped = Math.max(-1, Math.min(1, cos));
  return (Math.acos(clamped) * 180) / Math.PI;
}

/** The four joint-angle readouts we surface on the overlay. */
export interface LimbAngles {
  readonly leftElbow: number | null;
  readonly rightElbow: number | null;
  readonly leftKnee: number | null;
  readonly rightKnee: number | null;
}

export function computeLimbAngles(
  pose: Pose2D,
  minConfidence = 0.3,
): LimbAngles {
  const k = pose.keypoints;
  return {
    leftElbow: jointAngleDeg(
      k[JOINT_INDEX.left_shoulder],
      k[JOINT_INDEX.left_elbow],
      k[JOINT_INDEX.left_wrist],
      minConfidence,
    ),
    rightElbow: jointAngleDeg(
      k[JOINT_INDEX.right_shoulder],
      k[JOINT_INDEX.right_elbow],
      k[JOINT_INDEX.right_wrist],
      minConfidence,
    ),
    leftKnee: jointAngleDeg(
      k[JOINT_INDEX.left_hip],
      k[JOINT_INDEX.left_knee],
      k[JOINT_INDEX.left_ankle],
      minConfidence,
    ),
    rightKnee: jointAngleDeg(
      k[JOINT_INDEX.right_hip],
      k[JOINT_INDEX.right_knee],
      k[JOINT_INDEX.right_ankle],
      minConfidence,
    ),
  };
}

/** Extractors for the two overlay trails. */
export function extractCom2D(f: FrameAnalytics): NormalizedPoint2D {
  return f.com2D;
}
export function extractHip2D(f: FrameAnalytics): NormalizedPoint2D {
  return f.hip2D;
}

/**
 * A TechniqueEvent is "active" for a pill pulse if `t` falls within its
 * [startMs, endMs] window. Pure predicate so it's easy to test.
 */
export function isEventActive(ev: TechniqueEvent, tMs: number): boolean {
  return tMs >= ev.startMs && tMs <= ev.endMs;
}

/** Color per TechniqueEventKind, kept consistent with phase colors. */
export const TECHNIQUE_EVENT_COLORS: Readonly<Record<TechniqueEventKind, string>> = {
  flag: '#A78BFA',
  drop_knee: '#F472B6',
  backstep: '#FB923C',
  heel_hook: '#34D399',
  toe_hook: '#2DD4BF',
  barn_door: '#F87171',
  foot_cut: '#FBBF24',
  match: '#FACC15',
  deadpoint: '#60A5FA',
  dyno: '#EF4444',
  lockoff: '#93C5FD',
  smear: '#9CA3AF',
};
