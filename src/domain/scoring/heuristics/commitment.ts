import { centerOfMass2D } from '@analysis/kinematics/centerOfMass';
import {
  type AnalyticsTrack,
  type Hold,
  type MovementPhase,
  type Pose2D,
  type PoseTrack,
} from '@domain/models';

/**
 * Commitment on dynos: did the climber actually *commit* to each
 * dynamic move, or was it a half-effort "hope" throw?
 *
 * Signal: for every dyno phase, compute the peak CoM speed (normalized
 * units per second) relative to the straight-line reach distance
 * between the supporting holds and the target holds. A committed dyno
 * generates CoM speeds well above ambient motion, normalized by the
 * distance that had to be covered.
 *
 * If no dyno phases exist we return a neutral score (N/A).
 */
export interface CommitmentResult {
  readonly score: number;
  readonly rationale: string;
  readonly confidence: number;
}

const NEUTRAL_NO_DYNOS: CommitmentResult = {
  score: 75,
  rationale: 'No dyno phases detected — commitment N/A.',
  confidence: 0.3,
};

const NEUTRAL_NO_DATA: CommitmentResult = {
  score: 70,
  rationale: 'Dyno phases present but insufficient frames to judge commitment.',
  confidence: 0.3,
};

export function commitmentOnDynosScore(args: {
  readonly track: PoseTrack;
  readonly holds: ReadonlyArray<Hold>;
  readonly phases: ReadonlyArray<MovementPhase>;
  readonly phase?: MovementPhase;
  readonly analytics?: AnalyticsTrack;
}): CommitmentResult {
  const { track, holds, phases, phase } = args;
  const candidates = phase
    ? phase.kind === 'dyno'
      ? [phase]
      : []
    : phases.filter((p) => p.kind === 'dyno');
  if (candidates.length === 0) return NEUTRAL_NO_DYNOS;

  const holdsById = new Map(holds.map((h) => [h.id, h]));
  const posesByFrame = indexPosesByFrame(track.poses2D);
  const fps = track.fps > 0 ? track.fps : 30;

  const perDynoScores: number[] = [];
  for (const dyno of candidates) {
    const poses = slicePoses(posesByFrame, dyno);
    if (poses.length < 2) continue;
    const peakSpeed = computePeakComSpeed(poses, fps);
    const reachDistance = computeReachDistance(dyno, holdsById);
    if (!Number.isFinite(peakSpeed)) continue;
    // Committed dyno: velocity normalized by reach should be >= ~2.0
    // (peakSpeed per normalized unit of reach). We scale + clamp.
    const normalized = reachDistance > 0.02 ? peakSpeed / reachDistance : peakSpeed / 0.02;
    const score = mapCommitment(normalized);
    perDynoScores.push(score);
  }

  if (perDynoScores.length === 0) return NEUTRAL_NO_DATA;
  const mean = perDynoScores.reduce((s, v) => s + v, 0) / perDynoScores.length;
  const confidence = clamp01(perDynoScores.length / 3);
  const rationale = `Evaluated ${perDynoScores.length} dyno phase(s); mean commitment score ${mean.toFixed(0)}.`;
  return { score: clampScore(mean), rationale, confidence };
}

function indexPosesByFrame(poses: ReadonlyArray<Pose2D>): Map<number, Pose2D> {
  const m = new Map<number, Pose2D>();
  for (const p of poses) m.set(p.frame, p);
  return m;
}

function slicePoses(
  byFrame: ReadonlyMap<number, Pose2D>,
  phase: MovementPhase,
): Pose2D[] {
  const out: Pose2D[] = [];
  for (let f = phase.startFrame; f <= phase.endFrame; f++) {
    const p = byFrame.get(f);
    if (p) out.push(p);
  }
  return out;
}

function computePeakComSpeed(poses: ReadonlyArray<Pose2D>, fps: number): number {
  let peak = 0;
  const coms = poses.map((p) => centerOfMass2D(p));
  for (let i = 1; i < poses.length; i++) {
    const dtSec = Math.max(
      1 / fps,
      (poses[i].timestampMs - poses[i - 1].timestampMs) / 1000,
    );
    const dx = coms[i].x - coms[i - 1].x;
    const dy = coms[i].y - coms[i - 1].y;
    const speed = Math.hypot(dx, dy) / dtSec;
    if (speed > peak) peak = speed;
  }
  return peak;
}

function computeReachDistance(
  phase: MovementPhase,
  holdsById: ReadonlyMap<string, Hold>,
): number {
  if (phase.targetHoldIds.length === 0 || phase.supportingHoldIds.length === 0) {
    // Fallback reach distance (empirical): dynos typically cover 0.2+
    // normalized units. Return a middling 0.2 so the normalization
    // doesn't explode.
    return 0.2;
  }
  const targets = phase.targetHoldIds
    .map((id) => holdsById.get(id))
    .filter((h): h is Hold => !!h);
  const supports = phase.supportingHoldIds
    .map((id) => holdsById.get(id))
    .filter((h): h is Hold => !!h);
  if (targets.length === 0 || supports.length === 0) return 0.2;
  // Use mean target vs mean support distance.
  const tx = mean(targets.map((h) => h.position.x));
  const ty = mean(targets.map((h) => h.position.y));
  const sx = mean(supports.map((h) => h.position.x));
  const sy = mean(supports.map((h) => h.position.y));
  return Math.hypot(tx - sx, ty - sy);
}

function mean(xs: ReadonlyArray<number>): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function mapCommitment(normalized: number): number {
  // Empirical mapping:
  //   normalized ≈ 0.5 → 30 (weak throw)
  //   normalized ≈ 2.0 → 80 (solid commitment)
  //   normalized ≈ 3.5 → 95 (hard throw)
  if (normalized <= 0.5) return clampScore(30 * (normalized / 0.5));
  if (normalized <= 2.0) return clampScore(30 + ((normalized - 0.5) / 1.5) * 50);
  if (normalized <= 3.5) return clampScore(80 + ((normalized - 2.0) / 1.5) * 15);
  return clampScore(95);
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
