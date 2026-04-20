import { centerOfMass3D } from '@analysis/kinematics/centerOfMass';
import type {
  AnalyticsTrack,
  FrameAnalytics,
  MovementPhase,
  PoseTrack,
} from '@domain/models';

/**
 * Hip-to-wall distance: are the climber's hips pulled in to the wall
 * (like a "knee-in / drop-knee" body position) vs. "bird-caged" out
 * away from the wall?
 *
 * Preferred input: `AnalyticsTrack.perFrame.hipToWallMeters`, which
 * comes from the 3D lift's hip-z (wall at z=0 by convention). When
 * that's unavailable we fall back to deriving it from the poseTrack's
 * Pose3D joints via `centerOfMass3D`, and if even that's missing we
 * return a neutral 70 so the category doesn't drag the overall score
 * down for lift-confidence reasons.
 *
 * Scoring mapping (normalized "distance from wall" in pseudo-3D
 * meters):
 *   ≤ 0.10  → near ideal (95)
 *   ~ 0.25  → noticeable gap, scoring still ok (≈70)
 *   ≥ 0.45  → bird-caged, low score (≤40)
 */
export interface HipToWallResult {
  readonly score: number;
  readonly rationale: string;
  readonly confidence: number;
}

const NEUTRAL: HipToWallResult = {
  score: 70,
  rationale: 'No 3D lift available — hip-to-wall distance inferred neutrally.',
  confidence: 0.3,
};

export function hipToWallDistanceScore(args: {
  readonly phase?: MovementPhase;
  readonly track?: PoseTrack;
  readonly analytics?: AnalyticsTrack;
  readonly phaseIndex?: number;
}): HipToWallResult {
  const frames = collectFrames(args);
  if (frames.length === 0) return NEUTRAL;
  const mean = frames.reduce((s, d) => s + d, 0) / frames.length;
  const score = mapDistanceToScore(mean);
  const confidence = clamp01(frames.length / 10);
  const pct = (mean * 100).toFixed(0);
  const phasePart =
    args.phaseIndex !== undefined ? ` during phase ${args.phaseIndex + 1}` : '';
  return {
    score,
    rationale: `Hips averaged ${pct}cm from the wall${phasePart}.`,
    confidence,
  };
}

function collectFrames(args: {
  readonly phase?: MovementPhase;
  readonly track?: PoseTrack;
  readonly analytics?: AnalyticsTrack;
}): number[] {
  const { phase, track, analytics } = args;

  const fromAnalytics = readAnalyticsHipDistances(phase, analytics);
  if (fromAnalytics.length > 0) return fromAnalytics;

  // Fallback: derive from PoseTrack.poses3D directly.
  if (!track || track.poses3D.length === 0) return [];
  const relevant = phase
    ? track.poses3D.filter(
        (p) => p.frame >= phase.startFrame && p.frame <= phase.endFrame,
      )
    : track.poses3D.slice();
  if (relevant.length === 0) return [];
  const out: number[] = [];
  for (const pose3D of relevant) {
    const com = centerOfMass3D(pose3D);
    const d = Math.abs(com.z);
    if (Number.isFinite(d)) out.push(d);
  }
  return out;
}

function readAnalyticsHipDistances(
  phase: MovementPhase | undefined,
  analytics: AnalyticsTrack | undefined,
): number[] {
  if (!analytics || analytics.perFrame.length === 0) return [];
  const slice: ReadonlyArray<FrameAnalytics> = phase
    ? analytics.perFrame.filter(
        (f) => f.frame >= phase.startFrame && f.frame <= phase.endFrame,
      )
    : analytics.perFrame;
  const out: number[] = [];
  for (const f of slice) {
    if (f.hipToWallMeters !== undefined && Number.isFinite(f.hipToWallMeters)) {
      out.push(f.hipToWallMeters);
    }
  }
  return out;
}

function mapDistanceToScore(meters: number): number {
  // Smooth piecewise linear mapping.
  const m = Math.max(0, meters);
  if (m <= 0.1) {
    // 0 .. 0.10m → 100 .. 90
    return clampScore(100 - (m / 0.1) * 10);
  }
  if (m <= 0.25) {
    // 0.10 .. 0.25m → 90 .. 70
    return clampScore(90 - ((m - 0.1) / 0.15) * 20);
  }
  if (m <= 0.45) {
    // 0.25 .. 0.45m → 70 .. 40
    return clampScore(70 - ((m - 0.25) / 0.2) * 30);
  }
  // ≥ 0.45m → steep decline to 10
  return clampScore(40 - (m - 0.45) * 100);
}

function clampScore(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
