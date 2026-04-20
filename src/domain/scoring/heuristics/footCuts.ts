import { detectContacts } from '@analysis/holds/contact';
import {
  type AnalyticsTrack,
  type Hold,
  type MovementPhase,
  type Pose2D,
  type PoseTrack,
} from '@domain/models';

/**
 * Unnecessary foot cuts: feet coming off the wall during phases where
 * they shouldn't. Cutting feet mid-sequence on a static move is a
 * strong indicator of poor footwork / over-reliance on the arms.
 *
 * We only penalize foot cuts that happen OUTSIDE of legitimate
 * `dyno` phases — on a dyno, feet are expected to leave the wall.
 *
 * Signal: count frames in non-dyno phases where `< 1` foot is in
 * contact with a tagged hold. Normalize by total non-dyno frames.
 */
export interface FootCutsResult {
  readonly score: number;
  readonly rationale: string;
  readonly confidence: number;
}

const NEUTRAL: FootCutsResult = {
  score: 70,
  rationale: 'Not enough frames to judge foot cuts.',
  confidence: 0.3,
};

export function footCutsScore(args: {
  readonly track: PoseTrack;
  readonly holds: ReadonlyArray<Hold>;
  readonly phases: ReadonlyArray<MovementPhase>;
  readonly phase?: MovementPhase;
  readonly analytics?: AnalyticsTrack;
}): FootCutsResult {
  const { track, holds, phases, phase } = args;
  // When a specific phase is provided, only score that phase. Skip
  // dyno phases — cutting feet is the point of a dyno.
  const relevantPhases = phase ? [phase] : phases;
  const poseByFrame = indexPosesByFrame(track.poses2D);

  let examinedFrames = 0;
  let cutFrames = 0;
  let firstCutTimestampMs: number | undefined;

  for (const ph of relevantPhases) {
    if (ph.kind === 'dyno') continue;
    for (let f = ph.startFrame; f <= ph.endFrame; f++) {
      const pose = poseByFrame.get(f);
      if (!pose) continue;
      examinedFrames++;
      const contacts = detectContacts(pose, holds);
      const footCount = contacts.filter(
        (c) => c.limb === 'left_foot' || c.limb === 'right_foot',
      ).length;
      if (footCount === 0) {
        cutFrames++;
        if (firstCutTimestampMs === undefined) {
          firstCutTimestampMs = pose.timestampMs;
        }
      }
    }
  }

  if (examinedFrames === 0) return NEUTRAL;

  const ratio = cutFrames / examinedFrames;
  // Empirical mapping: 0% → 98, 10% → 80, 30% → 55, 60%+ → 20.
  const score = clampScore(98 - ratio * 130);
  const confidence = clamp01(examinedFrames / 30);
  const rationale =
    cutFrames > 0
      ? `Feet off the wall in ${Math.round(ratio * 100)}% of static frames` +
        (firstCutTimestampMs !== undefined
          ? ` (first cut at ${(firstCutTimestampMs / 1000).toFixed(1)}s).`
          : '.')
      : 'Feet stayed on the wall outside of dyno phases.';
  return { score, rationale, confidence };
}

function indexPosesByFrame(poses: ReadonlyArray<Pose2D>): Map<number, Pose2D> {
  const m = new Map<number, Pose2D>();
  for (const p of poses) m.set(p.frame, p);
  return m;
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
