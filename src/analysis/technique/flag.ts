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
  hipAnchor,
  mergeAdjacent,
  MIN_KP_CONFIDENCE,
  msToFrames,
} from './_helpers';

/**
 * Detect "flag" events — one foot in contact, the other foot extended
 * with NO contact, and torso orientation is stable (no violent rotation).
 *
 * Rule (precision-first):
 *  - Exactly one foot reports contact via `detectContacts`
 *  - The other foot's ankle is far from any hold center AND offset
 *    horizontally by > 1.5 * hip-width from the foot in contact
 *  - Held for at least 400 ms
 */
export function detectFlag(
  poseTrack: PoseTrack,
  _phases: ReadonlyArray<MovementPhase>,
  holds: ReadonlyArray<Hold>,
): TechniqueEvent[] {
  if (poseTrack.poses2D.length === 0) return [];
  const contexts = buildFrameContexts(poseTrack, holds);
  const minFrames = msToFrames(400, poseTrack.fps);

  const leftHits: boolean[] = [];
  const rightHits: boolean[] = [];
  for (const ctx of contexts) {
    const anchor = hipAnchor(ctx.pose);
    if (!anchor) {
      leftHits.push(false);
      rightHits.push(false);
      continue;
    }
    const hasLeftFoot = ctx.contacts.some((c) => c.limb === 'left_foot');
    const hasRightFoot = ctx.contacts.some((c) => c.limb === 'right_foot');
    const leftAnkle = ctx.pose.keypoints[JOINT_INDEX.left_ankle];
    const rightAnkle = ctx.pose.keypoints[JOINT_INDEX.right_ankle];
    const confLeft = leftAnkle && leftAnkle.confidence >= MIN_KP_CONFIDENCE;
    const confRight = rightAnkle && rightAnkle.confidence >= MIN_KP_CONFIDENCE;
    const hipW = anchor.width || 0.12;

    // Left flagging: right foot grounded, left foot far off
    const leftFlag =
      hasRightFoot &&
      !hasLeftFoot &&
      confLeft &&
      confRight &&
      Math.abs(leftAnkle.x - rightAnkle.x) > 1.5 * hipW &&
      !contactNearFoot(leftAnkle.x, leftAnkle.y, holds);
    leftHits.push(Boolean(leftFlag));

    const rightFlag =
      hasLeftFoot &&
      !hasRightFoot &&
      confLeft &&
      confRight &&
      Math.abs(leftAnkle.x - rightAnkle.x) > 1.5 * hipW &&
      !contactNearFoot(rightAnkle.x, rightAnkle.y, holds);
    rightHits.push(Boolean(rightFlag));
  }

  const out: TechniqueEvent[] = [];
  for (const [startIdx, endIdx] of findRuns(leftHits, minFrames)) {
    out.push(
      eventFromRun({
        kind: 'flag',
        track: poseTrack,
        startIdx,
        endIdx,
        confidence: 0.6,
        evidence: 'Left foot extended without contact while right foot carries weight.',
        involvedLimbs: ['left_foot'],
      }),
    );
  }
  for (const [startIdx, endIdx] of findRuns(rightHits, minFrames)) {
    out.push(
      eventFromRun({
        kind: 'flag',
        track: poseTrack,
        startIdx,
        endIdx,
        confidence: 0.6,
        evidence: 'Right foot extended without contact while left foot carries weight.',
        involvedLimbs: ['right_foot'],
      }),
    );
  }
  return mergeAdjacent(out);
}

function contactNearFoot(x: number, y: number, holds: ReadonlyArray<Hold>): boolean {
  for (const h of holds) {
    const dx = x - h.position.x;
    const dy = y - h.position.y;
    if (Math.hypot(dx, dy) <= h.radius * 1.6) return true;
  }
  return false;
}
