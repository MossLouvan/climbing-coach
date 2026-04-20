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
 * Detect "heel hook" events — the ankle in contact is above the
 * hold center in y (heel points up onto / over the hold) AND the
 * ankle sits higher (lower y) than the hip, implying the leg is
 * "pulled up" rather than standing on the hold.
 *
 * Held for at least 300 ms.
 *
 * Limitation: without a true 3D reconstruction we can't tell whether
 * the climber is *actually* using the heel vs. toe. The heuristic
 * proxies "foot is contacting a hold at or above hip level" which
 * is a strong correlate in practice.
 */
export function detectHeelHook(
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
  const relatedLeft: Array<HoldId | undefined> = [];
  const relatedRight: Array<HoldId | undefined> = [];

  for (const ctx of ctxs) {
    const k = ctx.pose.keypoints;
    const lh = k[JOINT_INDEX.left_hip];
    const rh = k[JOINT_INDEX.right_hip];
    const la = k[JOINT_INDEX.left_ankle];
    const ra = k[JOINT_INDEX.right_ankle];
    if (
      !lh ||
      !rh ||
      !la ||
      !ra ||
      lh.confidence < MIN_KP_CONFIDENCE ||
      rh.confidence < MIN_KP_CONFIDENCE
    ) {
      leftHits.push(false);
      rightHits.push(false);
      relatedLeft.push(undefined);
      relatedRight.push(undefined);
      continue;
    }
    const hipY = (lh.y + rh.y) / 2;

    const leftContact = ctx.contacts.find((c) => c.limb === 'left_foot');
    const rightContact = ctx.contacts.find((c) => c.limb === 'right_foot');

    const leftHook =
      leftContact &&
      la.confidence >= MIN_KP_CONFIDENCE &&
      la.y < hipY &&
      la.y < (holdById.get(leftContact.holdId)?.position.y ?? 1);
    leftHits.push(Boolean(leftHook));
    relatedLeft.push(leftHook ? leftContact!.holdId : undefined);

    const rightHook =
      rightContact &&
      ra.confidence >= MIN_KP_CONFIDENCE &&
      ra.y < hipY &&
      ra.y < (holdById.get(rightContact.holdId)?.position.y ?? 1);
    rightHits.push(Boolean(rightHook));
    relatedRight.push(rightHook ? rightContact!.holdId : undefined);
  }

  const out: TechniqueEvent[] = [];
  for (const [s, e] of findRuns(leftHits, minFrames)) {
    const related = relatedLeft[s] ? [relatedLeft[s] as HoldId] : undefined;
    out.push(
      eventFromRun({
        kind: 'heel_hook',
        track: poseTrack,
        startIdx: s,
        endIdx: e,
        confidence: 0.45,
        evidence: 'Left ankle above hip and above the contacted hold — likely a heel hook.',
        involvedLimbs: ['left_foot'],
        ...(related ? { relatedHoldIds: related } : {}),
      }),
    );
  }
  for (const [s, e] of findRuns(rightHits, minFrames)) {
    const related = relatedRight[s] ? [relatedRight[s] as HoldId] : undefined;
    out.push(
      eventFromRun({
        kind: 'heel_hook',
        track: poseTrack,
        startIdx: s,
        endIdx: e,
        confidence: 0.45,
        evidence: 'Right ankle above hip and above the contacted hold — likely a heel hook.',
        involvedLimbs: ['right_foot'],
        ...(related ? { relatedHoldIds: related } : {}),
      }),
    );
  }
  return mergeAdjacent(out);
}
