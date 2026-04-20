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
 * Detect "lockoff" events — elbow flexion < 90° held ≥ 1000 ms
 * while that arm is weighted (the hand is in contact with a hold).
 *
 * Elbow flexion is measured as the interior angle between upper arm
 * and forearm. If the hand's y is ABOVE the shoulder we treat that
 * as a valid pulling-overhead lockoff (a common cue). Otherwise the
 * constraint is the flexion angle alone.
 */
export function detectLockoff(
  poseTrack: PoseTrack,
  _phases: ReadonlyArray<MovementPhase>,
  holds: ReadonlyArray<Hold>,
): TechniqueEvent[] {
  if (poseTrack.poses2D.length === 0) return [];
  const ctxs = buildFrameContexts(poseTrack, holds);
  const minFrames = msToFrames(1000, poseTrack.fps);

  const leftHits: boolean[] = [];
  const rightHits: boolean[] = [];
  for (const ctx of ctxs) {
    const k = ctx.pose.keypoints;
    const ls = k[JOINT_INDEX.left_shoulder];
    const le = k[JOINT_INDEX.left_elbow];
    const lw = k[JOINT_INDEX.left_wrist];
    const rs = k[JOINT_INDEX.right_shoulder];
    const re = k[JOINT_INDEX.right_elbow];
    const rw = k[JOINT_INDEX.right_wrist];
    const confOk = [ls, le, lw, rs, re, rw].every(
      (p) => p && p.confidence >= MIN_KP_CONFIDENCE,
    );
    if (!confOk) {
      leftHits.push(false);
      rightHits.push(false);
      continue;
    }
    const leftHandWeighted = ctx.contacts.some((c) => c.limb === 'left_hand');
    const rightHandWeighted = ctx.contacts.some((c) => c.limb === 'right_hand');
    const leftAngle = angleDeg(ls, le, lw);
    const rightAngle = angleDeg(rs, re, rw);
    leftHits.push(leftHandWeighted && leftAngle < 90);
    rightHits.push(rightHandWeighted && rightAngle < 90);
  }

  const out: TechniqueEvent[] = [];
  for (const [s, e] of findRuns(leftHits, minFrames)) {
    out.push(
      eventFromRun({
        kind: 'lockoff',
        track: poseTrack,
        startIdx: s,
        endIdx: e,
        confidence: 0.65,
        evidence: 'Left elbow held under 90° with the left hand weighted for over a second.',
        involvedLimbs: ['left_arm'],
      }),
    );
  }
  for (const [s, e] of findRuns(rightHits, minFrames)) {
    out.push(
      eventFromRun({
        kind: 'lockoff',
        track: poseTrack,
        startIdx: s,
        endIdx: e,
        confidence: 0.65,
        evidence: 'Right elbow held under 90° with the right hand weighted for over a second.',
        involvedLimbs: ['right_arm'],
      }),
    );
  }
  return mergeAdjacent(out);
}

function angleDeg(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 === 0 || m2 === 0) return 180;
  const cos = Math.max(-1, Math.min(1, dot / (m1 * m2)));
  return (Math.acos(cos) * 180) / Math.PI;
}
