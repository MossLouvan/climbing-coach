import type { Pose2D } from '@domain/models';

/**
 * Dimensionless smoothness metric based on normalized jerk of the
 * body CoM trajectory — a standard measure in motor-control studies.
 * Lower mean |jerk| ⇒ smoother motion.
 *
 * We return jerk magnitudes (in normalized image units per s³) so
 * the scoring engine can map them to a 0..100 scale.
 */
export interface TrajectoryPoint {
  readonly x: number;
  readonly y: number;
  readonly tMs: number;
}

export function trajectoryJerkMag(points: ReadonlyArray<TrajectoryPoint>): number[] {
  if (points.length < 4) return [];
  const out: number[] = [];
  for (let i = 3; i < points.length; i++) {
    const p0 = points[i - 3];
    const p1 = points[i - 2];
    const p2 = points[i - 1];
    const p3 = points[i];
    const dt = Math.max(1, (p3.tMs - p0.tMs) / 1000 / 3);
    const jx = (p3.x - 3 * p2.x + 3 * p1.x - p0.x) / dt ** 3;
    const jy = (p3.y - 3 * p2.y + 3 * p1.y - p0.y) / dt ** 3;
    out.push(Math.hypot(jx, jy));
  }
  return out;
}

export function poseComTrajectory(
  poses: ReadonlyArray<Pose2D>,
  com: (p: Pose2D) => { x: number; y: number },
): TrajectoryPoint[] {
  return poses.map((p) => {
    const c = com(p);
    return { x: c.x, y: c.y, tMs: p.timestampMs };
  });
}
