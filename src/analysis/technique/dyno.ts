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
  mergeAdjacent,
  msToFrames,
} from './_helpers';

/**
 * Detect "dyno" technique events — all four limbs simultaneously
 * release contact for ≥ 150 ms.
 *
 * Note: phase segmentation has its own `dyno` phase kind. This event
 * is complementary: phases label behaviour CONTINUOUSLY, while this
 * event asserts that the specific "all limbs off" condition held
 * for long enough to be unambiguous.
 */
export function detectDyno(
  poseTrack: PoseTrack,
  _phases: ReadonlyArray<MovementPhase>,
  holds: ReadonlyArray<Hold>,
): TechniqueEvent[] {
  if (poseTrack.poses2D.length === 0) return [];
  const ctxs = buildFrameContexts(poseTrack, holds);
  const minFrames = msToFrames(150, poseTrack.fps);

  const hits = ctxs.map((c) => c.contacts.length === 0);
  const out: TechniqueEvent[] = [];
  for (const [s, e] of findRuns(hits, minFrames)) {
    out.push(
      eventFromRun({
        kind: 'dyno',
        track: poseTrack,
        startIdx: s,
        endIdx: e,
        confidence: 0.7,
        evidence: 'All four limbs off contact simultaneously for > 150 ms.',
      }),
    );
  }
  return mergeAdjacent(out);
}
