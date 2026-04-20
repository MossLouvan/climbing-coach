import { detectContacts } from '@analysis/holds/contact';
import { centerOfMass2D } from '@analysis/kinematics/centerOfMass';
import {
  type AnalyticsTrack,
  type Hold,
  type MovementPhase,
  type Pose2D,
  type PoseTrack,
} from '@domain/models';

/**
 * Hesitation: pauses at a handhold where the climber is already in
 * contact with the target (or at a "setup" before the next move) but
 * hasn't committed to the next reach yet. Stall time burns forearm
 * strength, so long hesitations are penalized.
 *
 * Signal: find stretches where:
 *  - the climber has at least one hand on a hold
 *  - the CoM barely moves (low inter-frame displacement)
 *  - body swing is low (they're not actively weight-shifting)
 *
 * We sum the seconds spent in such "stall" windows and penalize
 * proportionally to total duration.
 */
export interface HesitationResult {
  readonly score: number;
  readonly rationale: string;
  readonly confidence: number;
}

const NEUTRAL: HesitationResult = {
  score: 70,
  rationale: 'Not enough frames to judge hesitation.',
  confidence: 0.3,
};

export function hesitationScore(args: {
  readonly track: PoseTrack;
  readonly holds: ReadonlyArray<Hold>;
  readonly phase?: MovementPhase;
  readonly analytics?: AnalyticsTrack;
}): HesitationResult {
  const { track, holds, phase, analytics } = args;
  const slice = slicePoses(track.poses2D, phase);
  if (slice.length < 4) return NEUTRAL;
  const fps = track.fps > 0 ? track.fps : 30;

  // Pre-compute per-frame signals.
  const com = slice.map((p) => centerOfMass2D(p));
  const contactCount = slice.map(
    (p) =>
      detectContacts(p, holds).filter(
        (c) => c.limb === 'left_hand' || c.limb === 'right_hand',
      ).length,
  );
  const swing = analyticsSwingMap(analytics);

  // Scan for stall windows: ≥ 0.5s of low motion while a hand is on.
  const minStallFrames = Math.max(3, Math.round(fps * 0.5));
  let stallFrames = 0;
  let longestStallFrames = 0;

  let runStart = -1;
  for (let i = 1; i < slice.length; i++) {
    const dx = Math.abs(com[i].x - com[i - 1].x);
    const dy = Math.abs(com[i].y - com[i - 1].y);
    const motion = Math.hypot(dx, dy);
    const grippedHand = contactCount[i] >= 1;
    const swingValue = swing.get(slice[i].frame) ?? 0;
    const isStall = motion < 0.003 && Math.abs(swingValue) < 15 && grippedHand;
    if (isStall) {
      if (runStart < 0) runStart = i;
    } else {
      if (runStart >= 0) {
        const runLen = i - runStart;
        if (runLen >= minStallFrames) {
          stallFrames += runLen;
          if (runLen > longestStallFrames) longestStallFrames = runLen;
        }
        runStart = -1;
      }
    }
  }
  if (runStart >= 0) {
    const runLen = slice.length - runStart;
    if (runLen >= minStallFrames) {
      stallFrames += runLen;
      if (runLen > longestStallFrames) longestStallFrames = runLen;
    }
  }

  const stallSec = stallFrames / fps;
  const longestSec = longestStallFrames / fps;
  // Empirical mapping: no stalls → 95, 1s → 80, 2s → 65, 3.5s → ~43, 6s+ → <10.
  const score = clampScore(95 - stallSec * 15);
  const confidence = clamp01(slice.length / 30);
  const rationale =
    stallSec > 0
      ? `Paused for ${stallSec.toFixed(1)}s while gripping ` +
        `(longest stall ${longestSec.toFixed(1)}s).`
      : 'No notable grip-and-stall pauses detected.';
  return { score, rationale, confidence };
}

function slicePoses(
  poses: ReadonlyArray<Pose2D>,
  phase: MovementPhase | undefined,
): Pose2D[] {
  if (!phase) return poses.slice();
  return poses.filter((p) => p.frame >= phase.startFrame && p.frame <= phase.endFrame);
}

function analyticsSwingMap(
  analytics: AnalyticsTrack | undefined,
): Map<number, number> {
  const m = new Map<number, number>();
  if (!analytics) return m;
  for (const f of analytics.perFrame) m.set(f.frame, f.bodySwingDegPerSec);
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
