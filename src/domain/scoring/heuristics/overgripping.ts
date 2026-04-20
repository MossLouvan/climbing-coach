import { detectContacts } from '@analysis/holds/contact';
import {
  JOINT_INDEX,
  type AnalyticsTrack,
  type Hold,
  type MovementPhase,
  type Pose2D,
  type PoseTrack,
} from '@domain/models';

/**
 * Overgripping: hand stays clamped to a hold longer than the climber's
 * current move requires, and/or the wrist shakes/jitters while
 * weighted — both indicate arm-heavy climbing.
 *
 * Signals combined:
 *  - `lingerFraction`: average fraction of the track that each hand
 *    spent actively in contact with a hold. Well-paced climbers share
 *    load between hands and hips, so very high continuous-contact
 *    ratios penalize.
 *  - `wristJitter`: mean frame-to-frame movement of the wrist while
 *    in contact with a hold. A steady hand on a hold barely moves
 *    (<0.004 normalized units/frame). Tremor-level jitter (>0.012)
 *    suggests overgripping and strains the forearms.
 *
 * Also leans on `AnalyticsTrack.perFrame.bodySwingDegPerSec` when
 * available — high body swing while gripping implies the climber is
 * fighting the hold rather than flowing through it.
 */
export interface OvergrippingResult {
  readonly score: number;
  readonly rationale: string;
  readonly confidence: number;
}

const NEUTRAL: OvergrippingResult = {
  score: 70,
  rationale: 'Not enough contact frames to judge grip duration.',
  confidence: 0.3,
};

export function overgrippingScore(args: {
  readonly track: PoseTrack;
  readonly holds: ReadonlyArray<Hold>;
  readonly phase?: MovementPhase;
  readonly analytics?: AnalyticsTrack;
}): OvergrippingResult {
  const { track, holds, phase, analytics } = args;
  const slice = slicePoses(track.poses2D, phase);
  if (slice.length < 3 || holds.length === 0) return NEUTRAL;

  const contactFrames = slice.map((p) => detectContacts(p, holds));
  const handGripRatio = computeHandGripRatio(contactFrames);
  const jitter = computeWristJitter(slice, contactFrames);
  const swing = meanAbsSwing(analytics, phase);

  // Base score favors moderate contact ratios (0.25–0.55) — fully off
  // (no hand ever holds) and fully on (always double-cranking) are
  // both suspicious.
  const lingerPenalty = scaleLingerPenalty(handGripRatio);
  const jitterPenalty = Math.min(50, jitter * 2500);
  const swingPenalty = Math.min(15, swing * 0.15);

  const score = clampScore(100 - lingerPenalty - jitterPenalty - swingPenalty);
  const confidence = clamp01(slice.length / 30);
  const rationale =
    `Hands were weighted ${Math.round(handGripRatio * 100)}% of the time; ` +
    `wrist jitter ${(jitter * 1000).toFixed(1)}e-3/frame.`;
  return { score, rationale, confidence };
}

function slicePoses(
  poses: ReadonlyArray<Pose2D>,
  phase: MovementPhase | undefined,
): Pose2D[] {
  if (!phase) return poses.slice();
  return poses.filter((p) => p.frame >= phase.startFrame && p.frame <= phase.endFrame);
}

function computeHandGripRatio(
  contactFrames: ReadonlyArray<ReadonlyArray<{ limb: string }>>,
): number {
  if (contactFrames.length === 0) return 0;
  let gripFrames = 0;
  for (const cs of contactFrames) {
    const handCount = cs.filter(
      (c) => c.limb === 'left_hand' || c.limb === 'right_hand',
    ).length;
    if (handCount >= 1) gripFrames++;
  }
  return gripFrames / contactFrames.length;
}

function computeWristJitter(
  poses: ReadonlyArray<Pose2D>,
  contactFrames: ReadonlyArray<ReadonlyArray<{ limb: string }>>,
): number {
  let totalDelta = 0;
  let samples = 0;
  for (let i = 1; i < poses.length; i++) {
    const prev = poses[i - 1];
    const curr = poses[i];
    const prevC = contactFrames[i - 1];
    const currC = contactFrames[i];
    // Only measure jitter for wrists in contact in BOTH adjacent frames —
    // a transient "on/off" is a legitimate release, not a shake.
    const leftBoth =
      prevC.some((c) => c.limb === 'left_hand') &&
      currC.some((c) => c.limb === 'left_hand');
    const rightBoth =
      prevC.some((c) => c.limb === 'right_hand') &&
      currC.some((c) => c.limb === 'right_hand');
    if (!leftBoth && !rightBoth) continue;
    if (leftBoth) {
      const a = prev.keypoints[JOINT_INDEX.left_wrist];
      const b = curr.keypoints[JOINT_INDEX.left_wrist];
      totalDelta += Math.hypot(a.x - b.x, a.y - b.y);
      samples++;
    }
    if (rightBoth) {
      const a = prev.keypoints[JOINT_INDEX.right_wrist];
      const b = curr.keypoints[JOINT_INDEX.right_wrist];
      totalDelta += Math.hypot(a.x - b.x, a.y - b.y);
      samples++;
    }
  }
  if (samples === 0) return 0;
  return totalDelta / samples;
}

function meanAbsSwing(
  analytics: AnalyticsTrack | undefined,
  phase: MovementPhase | undefined,
): number {
  if (!analytics) return 0;
  const perFrame = phase
    ? analytics.perFrame.filter(
        (f) => f.frame >= phase.startFrame && f.frame <= phase.endFrame,
      )
    : analytics.perFrame;
  if (perFrame.length === 0) return 0;
  let sum = 0;
  for (const f of perFrame) sum += Math.abs(f.bodySwingDegPerSec);
  return sum / perFrame.length;
}

function scaleLingerPenalty(ratio: number): number {
  // Optimal band: 0.25..0.55. Outside band, ramp up penalty.
  if (ratio <= 0.1) return 20; // hands rarely engaged — suspicious but possibly between-moves
  if (ratio <= 0.55) {
    // Soft penalty for being too lightly engaged in the lower band.
    return Math.max(0, (0.25 - Math.min(ratio, 0.25)) * 60);
  }
  // Over the band — linger penalty ramps sharply.
  return Math.min(50, (ratio - 0.55) * 110);
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
