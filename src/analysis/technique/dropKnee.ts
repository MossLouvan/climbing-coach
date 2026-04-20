import {
  JOINT_INDEX,
  type Hold,
  type MovementPhase,
  type PoseTrack,
  type TechniqueEvent,
} from '@domain/models';

import {
  buildFrameContexts,
  eventFromRun,
  findRuns,
  mergeAdjacent,
  MIN_KP_CONFIDENCE,
  msToFrames,
} from './_helpers';

/**
 * Detect "drop knee" events — the knee drops between the hip and the
 * ankle with the knee rotated inward, while the foot is weighted.
 *
 * Cue: knee.x lies between hip.x and ankle.x AND hip.y < knee.y
 * (knee dropped below hip) AND knee-to-ankle x-delta is small
 * (knee is directly above / slightly inside foot).
 *
 * Limitation: with a single 2D camera, inward knee rotation is
 * hard to distinguish from simple flexion, so confidence is kept
 * moderate.
 */
export function detectDropKnee(
  poseTrack: PoseTrack,
  _phases: ReadonlyArray<MovementPhase>,
  holds: ReadonlyArray<Hold>,
): TechniqueEvent[] {
  if (poseTrack.poses2D.length === 0) return [];
  const ctxs = buildFrameContexts(poseTrack, holds);
  const minFrames = msToFrames(300, poseTrack.fps);

  const leftHits: boolean[] = [];
  const rightHits: boolean[] = [];
  for (const ctx of ctxs) {
    const k = ctx.pose.keypoints;
    const lh = k[JOINT_INDEX.left_hip];
    const rh = k[JOINT_INDEX.right_hip];
    const lk = k[JOINT_INDEX.left_knee];
    const rk = k[JOINT_INDEX.right_knee];
    const la = k[JOINT_INDEX.left_ankle];
    const ra = k[JOINT_INDEX.right_ankle];
    const ok = [lh, rh, lk, rk, la, ra].every(
      (kp) => kp && kp.confidence >= MIN_KP_CONFIDENCE,
    );
    if (!ok) {
      leftHits.push(false);
      rightHits.push(false);
      continue;
    }

    const lf = ctx.contacts.some((c) => c.limb === 'left_foot');
    const rf = ctx.contacts.some((c) => c.limb === 'right_foot');

    // Left drop knee: left foot weighted, knee x between hip and ankle,
    // knee dropped below hip.
    const leftDrop =
      lf &&
      lk.y > lh.y &&
      isBetween(lk.x, lh.x, la.x) &&
      Math.abs(lk.x - la.x) < Math.abs(lh.x - la.x);
    leftHits.push(leftDrop);

    const rightDrop =
      rf &&
      rk.y > rh.y &&
      isBetween(rk.x, rh.x, ra.x) &&
      Math.abs(rk.x - ra.x) < Math.abs(rh.x - ra.x);
    rightHits.push(rightDrop);
  }

  const out: TechniqueEvent[] = [];
  for (const [s, e] of findRuns(leftHits, minFrames)) {
    out.push(
      eventFromRun({
        kind: 'drop_knee',
        track: poseTrack,
        startIdx: s,
        endIdx: e,
        confidence: 0.5,
        evidence: 'Left knee dropped inside the hip-ankle line with the left foot weighted.',
        involvedLimbs: ['left_leg'],
      }),
    );
  }
  for (const [s, e] of findRuns(rightHits, minFrames)) {
    out.push(
      eventFromRun({
        kind: 'drop_knee',
        track: poseTrack,
        startIdx: s,
        endIdx: e,
        confidence: 0.5,
        evidence: 'Right knee dropped inside the hip-ankle line with the right foot weighted.',
        involvedLimbs: ['right_leg'],
      }),
    );
  }
  return mergeAdjacent(out);
}

function isBetween(v: number, a: number, b: number): boolean {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return v >= lo && v <= hi;
}
