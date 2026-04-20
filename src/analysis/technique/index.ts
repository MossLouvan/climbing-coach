import type {
  Hold,
  MovementPhase,
  PoseTrack,
  TechniqueEvent,
} from '@domain/models';

import { detectBackstep } from './backstep';
import { detectBarnDoor } from './barnDoor';
import { detectDeadpoint } from './deadpoint';
import { detectDropKnee } from './dropKnee';
import { detectDyno } from './dyno';
import { detectFlag } from './flag';
import { detectFootCut } from './footCut';
import { detectHeelHook } from './heelHook';
import { detectLockoff } from './lockoff';
import { detectMatch } from './match';
import { detectSmear } from './smear';
import { detectToeHook } from './toeHook';

export { detectBackstep } from './backstep';
export { detectBarnDoor } from './barnDoor';
export { detectDeadpoint } from './deadpoint';
export { detectDropKnee } from './dropKnee';
export { detectDyno } from './dyno';
export { detectFlag } from './flag';
export { detectFootCut } from './footCut';
export { detectHeelHook } from './heelHook';
export { detectLockoff } from './lockoff';
export { detectMatch } from './match';
export { detectSmear } from './smear';
export { detectToeHook } from './toeHook';

/**
 * Run every technique detector on the given pose track and return
 * the combined list of events, sorted by startFrame.
 */
export function detectTechniqueEvents(
  poseTrack: PoseTrack,
  phases: ReadonlyArray<MovementPhase>,
  holds: ReadonlyArray<Hold>,
): TechniqueEvent[] {
  if (!poseTrack || poseTrack.poses2D.length === 0) return [];
  const all: TechniqueEvent[] = [];
  all.push(...detectFlag(poseTrack, phases, holds));
  all.push(...detectDropKnee(poseTrack, phases, holds));
  all.push(...detectBackstep(poseTrack, phases, holds));
  all.push(...detectHeelHook(poseTrack, phases, holds));
  all.push(...detectToeHook(poseTrack, phases, holds));
  all.push(...detectBarnDoor(poseTrack, phases, holds));
  all.push(...detectFootCut(poseTrack, phases, holds));
  all.push(...detectMatch(poseTrack, phases, holds));
  all.push(...detectDeadpoint(poseTrack, phases, holds));
  all.push(...detectDyno(poseTrack, phases, holds));
  all.push(...detectLockoff(poseTrack, phases, holds));
  all.push(...detectSmear(poseTrack, phases, holds));

  all.sort((a, b) => {
    if (a.startFrame !== b.startFrame) return a.startFrame - b.startFrame;
    return a.kind.localeCompare(b.kind);
  });
  return all;
}
