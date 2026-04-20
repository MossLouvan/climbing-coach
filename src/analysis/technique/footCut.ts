import type {
  Hold,
  MovementPhase,
  PoseTrack,
  TechniqueEvent,
} from '@domain/models';

import {
  buildFrameContexts,
  eventFromRun,
  findRuns,
  isFrameInsideDyno,
  mergeAdjacent,
  msToFrames,
} from './_helpers';

/**
 * Detect "foot cut" events — both feet simultaneously lose contact
 * with all holds for ≥ 100 ms OUTSIDE of a dyno phase (a dyno is
 * expected to release everything, so we don't double-report).
 */
export function detectFootCut(
  poseTrack: PoseTrack,
  phases: ReadonlyArray<MovementPhase>,
  holds: ReadonlyArray<Hold>,
): TechniqueEvent[] {
  if (poseTrack.poses2D.length === 0) return [];
  const ctxs = buildFrameContexts(poseTrack, holds);
  const minFrames = msToFrames(100, poseTrack.fps);

  const hits: boolean[] = ctxs.map((ctx) => {
    const lf = ctx.contacts.some((c) => c.limb === 'left_foot');
    const rf = ctx.contacts.some((c) => c.limb === 'right_foot');
    return !lf && !rf;
  });

  // Mask out frames inside any dyno phase
  for (let i = 0; i < hits.length; i++) {
    if (!hits[i]) continue;
    const frame = poseTrack.poses2D[i].frame;
    if (isFrameInsideDyno(phases, frame)) hits[i] = false;
  }

  const out: TechniqueEvent[] = [];
  for (const [s, e] of findRuns(hits, minFrames)) {
    out.push(
      eventFromRun({
        kind: 'foot_cut',
        track: poseTrack,
        startIdx: s,
        endIdx: e,
        confidence: 0.65,
        evidence: 'Both feet lost contact outside of a dyno phase.',
        involvedLimbs: ['left_foot', 'right_foot'],
      }),
    );
  }
  return mergeAdjacent(out);
}
