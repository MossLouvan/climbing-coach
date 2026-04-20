import {
  JOINT_INDEX,
  type Hold,
  type HoldId,
  type MovementPhase,
  type PoseTrack,
  type TechniqueEvent,
} from '@domain/models';

import {
  eventFromRun,
  findRuns,
  mergeAdjacent,
  MIN_KP_CONFIDENCE,
  msToFrames,
} from './_helpers';

/**
 * Detect "match" events — both hands within `hold.radius` of the
 * same hold simultaneously for ≥ 200 ms.
 */
export function detectMatch(
  poseTrack: PoseTrack,
  _phases: ReadonlyArray<MovementPhase>,
  holds: ReadonlyArray<Hold>,
): TechniqueEvent[] {
  const poses = poseTrack.poses2D;
  if (poses.length === 0) return [];
  const minFrames = msToFrames(200, poseTrack.fps);

  const hits: boolean[] = new Array(poses.length).fill(false);
  const matchedHold: Array<HoldId | undefined> = new Array(poses.length).fill(undefined);

  for (let i = 0; i < poses.length; i++) {
    const lw = poses[i].keypoints[JOINT_INDEX.left_wrist];
    const rw = poses[i].keypoints[JOINT_INDEX.right_wrist];
    if (
      !lw ||
      !rw ||
      lw.confidence < MIN_KP_CONFIDENCE ||
      rw.confidence < MIN_KP_CONFIDENCE
    ) {
      continue;
    }
    for (const h of holds) {
      if (
        h.intendedLimb &&
        h.intendedLimb !== 'either' &&
        h.intendedLimb !== 'left_hand' &&
        h.intendedLimb !== 'right_hand'
      ) {
        continue;
      }
      const radius = h.radius * 1.2;
      const lDist = Math.hypot(lw.x - h.position.x, lw.y - h.position.y);
      const rDist = Math.hypot(rw.x - h.position.x, rw.y - h.position.y);
      if (lDist <= radius && rDist <= radius) {
        hits[i] = true;
        matchedHold[i] = h.id;
        break;
      }
    }
  }

  const out: TechniqueEvent[] = [];
  for (const [s, e] of findRuns(hits, minFrames)) {
    const hid = matchedHold[s];
    out.push(
      eventFromRun({
        kind: 'match',
        track: poseTrack,
        startIdx: s,
        endIdx: e,
        confidence: 0.75,
        evidence: 'Both hands overlapped the same hold.',
        involvedLimbs: ['left_hand', 'right_hand'],
        ...(hid ? { relatedHoldIds: [hid] } : {}),
      }),
    );
  }
  return mergeAdjacent(out);
}
