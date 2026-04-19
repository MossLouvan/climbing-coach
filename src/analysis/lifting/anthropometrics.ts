/**
 * Standard segment-length proportions as a fraction of body height.
 *
 * Sourced from average adult anthropometric tables (Drillis & Contini,
 * 1966 — the numbers most commonly cited in biomechanics textbooks).
 * These are rough averages; a real product would calibrate per-user.
 *
 * The lifting pipeline uses these to:
 *   - turn a user's `heightM` into expected segment lengths
 *   - solve for a plausible depth (z) for each joint given its projected
 *     2D distance from its parent — a classic approximation used in
 *     single-view pose-lifting.
 *
 * We document it explicitly: this is a HEURISTIC depth estimator, not
 * a learned monocular 3D pose model. Results are qualitative.
 */
export interface SegmentLengths {
  readonly upperArm: number;
  readonly forearm: number;
  readonly thigh: number;
  readonly shank: number;
  readonly torso: number; // shoulder to hip along spine
  readonly shoulderWidth: number;
  readonly hipWidth: number;
  readonly neck: number;
}

export const DEFAULT_HEIGHT_M = 1.75;

/** Fractions of body height. */
const FRACTIONS = {
  upperArm: 0.186,
  forearm: 0.146,
  thigh: 0.245,
  shank: 0.246,
  torso: 0.288,
  shoulderWidth: 0.259,
  hipWidth: 0.191,
  neck: 0.052,
} as const;

export function segmentLengthsForHeight(heightM: number): SegmentLengths {
  const h = heightM > 0 ? heightM : DEFAULT_HEIGHT_M;
  return {
    upperArm: h * FRACTIONS.upperArm,
    forearm: h * FRACTIONS.forearm,
    thigh: h * FRACTIONS.thigh,
    shank: h * FRACTIONS.shank,
    torso: h * FRACTIONS.torso,
    shoulderWidth: h * FRACTIONS.shoulderWidth,
    hipWidth: h * FRACTIONS.hipWidth,
    neck: h * FRACTIONS.neck,
  };
}
