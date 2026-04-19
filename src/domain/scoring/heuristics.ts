import { centerOfMass2D } from '@analysis/kinematics/centerOfMass';
import { detectContacts } from '@analysis/holds/contact';
import { supportRegion } from '@analysis/holds/supportPolygon';
import { poseComTrajectory, trajectoryJerkMag } from '@analysis/kinematics/smoothness';
import {
  type Hold,
  JOINT_INDEX,
  type MovementPhase,
  type Pose2D,
  type PoseTrack,
  type Route,
} from '@domain/models';

/**
 * Pure, unit-testable heuristics. Each function produces a bounded
 * 0..100 score and (optionally) a text rationale. The scoring engine
 * composes these into a TechniqueReport.
 *
 * All distances here are in NORMALIZED image coordinates unless stated.
 */

export interface HeuristicResult {
  readonly score: number; // 0..100
  readonly rationale: string;
}

/**
 * Balance: how often the CoM-x lies within the support-x extent.
 *
 * Climbing-specific tweak: we allow a small "out-of-column" slack
 * before penalizing, because pulling slightly outside the support
 * column is often necessary to set up a dynamic move.
 */
export function balanceScore(
  phase: MovementPhase,
  poses: ReadonlyArray<Pose2D>,
  holds: ReadonlyArray<Hold>,
): HeuristicResult {
  const slice = slicePhase(poses, phase);
  if (slice.length === 0) return { score: 60, rationale: 'No usable frames in phase.' };
  let outCount = 0;
  let totalDeviation = 0;
  const slack = 0.04;
  for (const p of slice) {
    const contacts = detectContacts(p, holds);
    const support = supportRegion(contacts, holds);
    if (support.weight === 0) {
      outCount++;
      continue;
    }
    const com = centerOfMass2D(p);
    if (com.x < support.xMin - slack) {
      outCount++;
      totalDeviation += (support.xMin - com.x) - slack;
    } else if (com.x > support.xMax + slack) {
      outCount++;
      totalDeviation += (com.x - support.xMax) - slack;
    }
  }
  const outRatio = outCount / slice.length;
  const avgDev = outCount > 0 ? totalDeviation / outCount : 0;
  const score = clampScore(100 - outRatio * 60 - avgDev * 800);
  const rationale =
    outRatio === 0
      ? 'CoM stayed above the support column — strong base.'
      : `CoM drifted off support in ${Math.round(outRatio * 100)}% of frames (avg ${(avgDev * 100).toFixed(1)}% of frame).`;
  return { score, rationale };
}

/**
 * Hip positioning: for frames with any hand in contact, how close is
 * the hip midpoint (in x) to directly underneath an active hand hold?
 *
 * Climbing cue: getting "under" the hold reduces arm load.
 */
export function hipPositioningScore(
  phase: MovementPhase,
  poses: ReadonlyArray<Pose2D>,
  holds: ReadonlyArray<Hold>,
): HeuristicResult {
  const slice = slicePhase(poses, phase);
  if (slice.length === 0) return { score: 60, rationale: 'No usable frames.' };
  const holdMap = new Map(holds.map((h) => [h.id, h]));
  let total = 0;
  let n = 0;
  for (const p of slice) {
    const contacts = detectContacts(p, holds);
    const handContacts = contacts.filter(
      (c) => c.limb === 'left_hand' || c.limb === 'right_hand',
    );
    if (handContacts.length === 0) continue;
    const hipMidX =
      (p.keypoints[JOINT_INDEX.left_hip].x + p.keypoints[JOINT_INDEX.right_hip].x) / 2;
    let closest = 1;
    for (const c of handContacts) {
      const hold = holdMap.get(c.holdId);
      if (!hold) continue;
      const dx = Math.abs(hipMidX - hold.position.x);
      if (dx < closest) closest = dx;
    }
    total += closest;
    n++;
  }
  if (n === 0) return { score: 60, rationale: 'No hand contacts during this phase.' };
  const avg = total / n;
  const score = clampScore(100 - avg * 400);
  return {
    score,
    rationale: `Avg horizontal hip offset from active hand hold: ${(avg * 100).toFixed(1)}% of frame.`,
  };
}

/**
 * Flagging usage: reward phases flagged as `flag` where the geometry
 * genuinely requires counterbalance (reach on the opposite side of
 * the body). Penalize missed opportunities — reach phases where hand
 * is moving far off the support column but no flag is engaged.
 */
export function flaggingScore(
  phase: MovementPhase,
  poses: ReadonlyArray<Pose2D>,
): HeuristicResult {
  if (phase.kind === 'flag') {
    return { score: 88, rationale: 'Counterbalance flag engaged during this phase.' };
  }
  if (phase.kind !== 'reach') {
    return { score: 75, rationale: 'Flagging not relevant for this phase.' };
  }
  // Reach phase without flag kind: check if hands drifted far from
  // support — suggests it would have helped.
  const slice = slicePhase(poses, phase);
  if (slice.length === 0) return { score: 70, rationale: 'No frames to judge.' };
  let drift = 0;
  for (const p of slice) {
    const shoulderMidX =
      (p.keypoints[JOINT_INDEX.left_shoulder].x + p.keypoints[JOINT_INDEX.right_shoulder].x) / 2;
    const rwX = p.keypoints[JOINT_INDEX.right_wrist].x;
    const lwX = p.keypoints[JOINT_INDEX.left_wrist].x;
    const maxHandDrift = Math.max(Math.abs(rwX - shoulderMidX), Math.abs(lwX - shoulderMidX));
    drift = Math.max(drift, maxHandDrift);
  }
  if (drift > 0.2) {
    return {
      score: 58,
      rationale: 'Reached far off-balance without flagging — could have saved energy.',
    };
  }
  return { score: 80, rationale: 'Reach was balanced; flag not required.' };
}

/**
 * Reach efficiency: distance from hand at phase-start to the target
 * hold divided by the path length the hand actually traveled. An
 * efficient reach travels close to a straight line.
 */
export function reachEfficiencyScore(
  phase: MovementPhase,
  poses: ReadonlyArray<Pose2D>,
  holds: ReadonlyArray<Hold>,
): HeuristicResult {
  if (phase.kind !== 'reach') {
    return { score: 75, rationale: 'Not a reach phase.' };
  }
  const slice = slicePhase(poses, phase);
  if (slice.length < 2) return { score: 65, rationale: 'Reach too short to judge.' };
  const target = holds.find((h) => phase.targetHoldIds.includes(h.id));
  if (!target) return { score: 65, rationale: 'No target hold associated with reach.' };
  // Pick the hand that ended closest to the target.
  const endFrame = slice[slice.length - 1];
  const lwEnd = endFrame.keypoints[JOINT_INDEX.left_wrist];
  const rwEnd = endFrame.keypoints[JOINT_INDEX.right_wrist];
  const dLeft = Math.hypot(lwEnd.x - target.position.x, lwEnd.y - target.position.y);
  const dRight = Math.hypot(rwEnd.x - target.position.x, rwEnd.y - target.position.y);
  const useLeft = dLeft < dRight;

  let pathLen = 0;
  for (let i = 1; i < slice.length; i++) {
    const a = slice[i - 1].keypoints[useLeft ? JOINT_INDEX.left_wrist : JOINT_INDEX.right_wrist];
    const b = slice[i].keypoints[useLeft ? JOINT_INDEX.left_wrist : JOINT_INDEX.right_wrist];
    pathLen += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const startKp = slice[0].keypoints[useLeft ? JOINT_INDEX.left_wrist : JOINT_INDEX.right_wrist];
  const straight = Math.hypot(
    target.position.x - startKp.x,
    target.position.y - startKp.y,
  );
  if (pathLen === 0) return { score: 70, rationale: 'Hand did not move.' };
  const ratio = straight / pathLen; // 0..1, 1 is ideal
  const score = clampScore(ratio * 100);
  return {
    score,
    rationale: `Reach path efficiency: ${(ratio * 100).toFixed(0)}% (direct / traveled).`,
  };
}

/**
 * Stability: penalize fast CoM oscillation during "setup" phases,
 * where the climber is supposed to be settled.
 */
export function stabilityScore(
  phase: MovementPhase,
  poses: ReadonlyArray<Pose2D>,
): HeuristicResult {
  if (phase.kind !== 'setup' && phase.kind !== 'rest') {
    return { score: 75, rationale: 'Stability assessment applies mainly to setup/rest.' };
  }
  const slice = slicePhase(poses, phase);
  if (slice.length < 4) return { score: 70, rationale: 'Phase too short.' };
  const traj = poseComTrajectory(slice, centerOfMass2D);
  const jerks = trajectoryJerkMag(traj);
  if (jerks.length === 0) return { score: 75, rationale: 'Not enough data.' };
  const meanJerk = jerks.reduce((s, j) => s + j, 0) / jerks.length;
  // Empirical mapping: meanJerk ~0.1 (steady) → 95; ~2.0 (shaky) → 40.
  const score = clampScore(100 - meanJerk * 30);
  return {
    score,
    rationale: `Mean CoM jerk ${meanJerk.toFixed(2)} (lower is steadier).`,
  };
}

/**
 * Dynamic control: for dyno phases, penalize CoM overshoot after the
 * catch. We look at CoM x after the phase ends — it should settle
 * quickly if control was good.
 */
export function dynamicControlScore(
  phase: MovementPhase,
  poses: ReadonlyArray<Pose2D>,
): HeuristicResult {
  if (phase.kind !== 'dyno') {
    return { score: 75, rationale: 'Not a dynamic move.' };
  }
  const phaseEndFrame = phase.endFrame;
  const postWindow = poses.filter(
    (p) => p.frame > phaseEndFrame && p.frame <= phaseEndFrame + 15,
  );
  if (postWindow.length < 2) {
    return { score: 70, rationale: 'Not enough post-catch frames to judge.' };
  }
  let xMin = 1;
  let xMax = 0;
  for (const p of postWindow) {
    const com = centerOfMass2D(p);
    if (com.x < xMin) xMin = com.x;
    if (com.x > xMax) xMax = com.x;
  }
  const swing = xMax - xMin;
  const score = clampScore(100 - swing * 350);
  return {
    score,
    rationale: `Post-catch horizontal swing: ${(swing * 100).toFixed(1)}% of frame.`,
  };
}

/** Overall whole-climb smoothness from CoM jerk. */
export function smoothnessScore(track: PoseTrack): HeuristicResult {
  if (track.poses2D.length < 4) return { score: 70, rationale: 'Too short to judge.' };
  const traj = poseComTrajectory(track.poses2D, centerOfMass2D);
  const jerks = trajectoryJerkMag(traj);
  if (jerks.length === 0) return { score: 70, rationale: 'Not enough data.' };
  const meanJerk = jerks.reduce((s, j) => s + j, 0) / jerks.length;
  const score = clampScore(100 - meanJerk * 25);
  return { score, rationale: `Whole-climb mean CoM jerk ${meanJerk.toFixed(2)}.` };
}

/**
 * Route adherence: do the targets touched during `reach` and `match`
 * phases match the intended sequence on the route?
 *
 * V1 heuristic: we check that the sequence of UNIQUE hands-on-hold
 * contacts is a subsequence of the intended route `sequence`.
 */
export function routeAdherenceScore(
  phases: ReadonlyArray<MovementPhase>,
  route: Route,
  poses: ReadonlyArray<Pose2D>,
): HeuristicResult {
  const intended = route.sequence.map((s) => s.holdId);
  if (intended.length === 0) {
    return { score: 70, rationale: 'No intended sequence defined for the route.' };
  }
  const actual: typeof intended = [];
  for (const p of poses) {
    const contacts = detectContacts(p, route.holds);
    for (const c of contacts) {
      if (c.limb === 'left_hand' || c.limb === 'right_hand') {
        if (actual[actual.length - 1] !== c.holdId) actual.push(c.holdId);
      }
    }
  }
  if (actual.length === 0) return { score: 50, rationale: 'No hand contacts detected.' };
  let i = 0;
  let matched = 0;
  for (const h of actual) {
    while (i < intended.length && intended[i] !== h) i++;
    if (i < intended.length) {
      matched++;
      i++;
    }
  }
  const ratio = matched / intended.length;
  const score = clampScore(ratio * 100);
  void phases;
  return {
    score,
    rationale: `Hit ${matched}/${intended.length} intended holds in order.`,
  };
}

function slicePhase(poses: ReadonlyArray<Pose2D>, phase: MovementPhase): Pose2D[] {
  return poses.filter((p) => p.frame >= phase.startFrame && p.frame <= phase.endFrame);
}

function clampScore(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}
