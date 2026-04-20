import {
  JOINT_INDEX,
  type Hold,
  type HoldId,
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
 * Detect "toe hook" events — the ankle is HIGHER than the knee
 * (ankle y < knee y) while in contact with a hold that sits above
 * (hold.y < hip.y). In a toe hook, the foot is pulling upward by the
 * toes so the ankle is "above" the knee in the image.
 *
 * Held for at least 300 ms.
 *
 * Limitation: same caveat as heel_hook — without 3D we can't
 * verify the foot orientation, only the geometric configuration.
 */
export function detectToeHook(
  poseTrack: PoseTrack,
  _phases: ReadonlyArray<MovementPhase>,
  holds: ReadonlyArray<Hold>,
): TechniqueEvent[] {
  if (poseTrack.poses2D.length === 0) return [];
  const ctxs = buildFrameContexts(poseTrack, holds);
  const holdById = new Map(holds.map((h) => [h.id, h]));
  const minFrames = msToFrames(300, poseTrack.fps);

  const leftHits: boolean[] = [];
  const rightHits: boolean[] = [];
  const leftRel: Array<HoldId | undefined> = [];
  const rightRel: Array<HoldId | undefined> = [];

  for (const ctx of ctxs) {
    const k = ctx.pose.keypoints;
    const lh = k[JOINT_INDEX.left_hip];
    const rh = k[JOINT_INDEX.right_hip];
    const lk = k[JOINT_INDEX.left_knee];
    const rk = k[JOINT_INDEX.right_knee];
    const la = k[JOINT_INDEX.left_ankle];
    const ra = k[JOINT_INDEX.right_ankle];
    if (
      !lh ||
      !rh ||
      !lk ||
      !rk ||
      !la ||
      !ra ||
      [lh, rh, lk, rk, la, ra].some((kp) => kp.confidence < MIN_KP_CONFIDENCE)
    ) {
      leftHits.push(false);
      rightHits.push(false);
      leftRel.push(undefined);
      rightRel.push(undefined);
      continue;
    }
    const hipY = (lh.y + rh.y) / 2;
    const leftContact = ctx.contacts.find((c) => c.limb === 'left_foot');
    const rightContact = ctx.contacts.find((c) => c.limb === 'right_foot');

    const leftHook =
      leftContact &&
      la.y < lk.y &&
      (holdById.get(leftContact.holdId)?.position.y ?? 1) < hipY;
    leftHits.push(Boolean(leftHook));
    leftRel.push(leftHook ? leftContact!.holdId : undefined);

    const rightHook =
      rightContact &&
      ra.y < rk.y &&
      (holdById.get(rightContact.holdId)?.position.y ?? 1) < hipY;
    rightHits.push(Boolean(rightHook));
    rightRel.push(rightHook ? rightContact!.holdId : undefined);
  }

  const out: TechniqueEvent[] = [];
  for (const [s, e] of findRuns(leftHits, minFrames)) {
    const related = leftRel[s] ? [leftRel[s] as HoldId] : undefined;
    out.push(
      eventFromRun({
        kind: 'toe_hook',
        track: poseTrack,
        startIdx: s,
        endIdx: e,
        confidence: 0.4,
        evidence: 'Left ankle pulled above the knee while contacting a hold above the hips.',
        involvedLimbs: ['left_foot'],
        ...(related ? { relatedHoldIds: related } : {}),
      }),
    );
  }
  for (const [s, e] of findRuns(rightHits, minFrames)) {
    const related = rightRel[s] ? [rightRel[s] as HoldId] : undefined;
    out.push(
      eventFromRun({
        kind: 'toe_hook',
        track: poseTrack,
        startIdx: s,
        endIdx: e,
        confidence: 0.4,
        evidence: 'Right ankle pulled above the knee while contacting a hold above the hips.',
        involvedLimbs: ['right_foot'],
        ...(related ? { relatedHoldIds: related } : {}),
      }),
    );
  }
  return mergeAdjacent(out);
}
