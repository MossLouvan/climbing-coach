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
 * Detect "backstep" events — a foot is in contact, but the foot's
 * horizontal position sits on the OPPOSITE side of the hip from what
 * its limb name suggests (e.g. right foot is to the left of the hip
 * midline by > 0.25 * hip-width).
 *
 * Held for at least 300 ms.
 */
export function detectBackstep(
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
    const anchor = hipAnchor(ctx.pose);
    if (!anchor) {
      leftHits.push(false);
      rightHits.push(false);
      continue;
    }
    const hipW = anchor.width || 0.12;
    const threshold = hipW * 0.25;

    const la = ctx.pose.keypoints[JOINT_INDEX.left_ankle];
    const ra = ctx.pose.keypoints[JOINT_INDEX.right_ankle];

    const lf = ctx.contacts.some((c) => c.limb === 'left_foot');
    const rf = ctx.contacts.some((c) => c.limb === 'right_foot');

    const leftBack =
      lf &&
      la &&
      la.confidence >= MIN_KP_CONFIDENCE &&
      la.x > anchor.x + threshold;
    leftHits.push(Boolean(leftBack));

    const rightBack =
      rf &&
      ra &&
      ra.confidence >= MIN_KP_CONFIDENCE &&
      ra.x < anchor.x - threshold;
    rightHits.push(Boolean(rightBack));
  }

  const out: TechniqueEvent[] = [];
  for (const [s, e] of findRuns(leftHits, minFrames)) {
    out.push(
      eventFromRun({
        kind: 'backstep',
        track: poseTrack,
        startIdx: s,
        endIdx: e,
        confidence: 0.55,
        evidence: 'Left foot in contact but crossed to the right of the hip line.',
        involvedLimbs: ['left_foot'],
      }),
    );
  }
  for (const [s, e] of findRuns(rightHits, minFrames)) {
    out.push(
      eventFromRun({
        kind: 'backstep',
        track: poseTrack,
        startIdx: s,
        endIdx: e,
        confidence: 0.55,
        evidence: 'Right foot in contact but crossed to the left of the hip line.',
        involvedLimbs: ['right_foot'],
      }),
    );
  }
  return mergeAdjacent(out);
}
