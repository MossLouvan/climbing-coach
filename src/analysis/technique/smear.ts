import { JOINT_INDEX, type Hold, type MovementPhase, type PoseTrack, type TechniqueEvent } from '@domain/models';

import {
  eventFromRun,
  findRuns,
  mergeAdjacent,
  MIN_KP_CONFIDENCE,
  msToFrames,
} from './_helpers';

/**
 * Detect "smear" events — a foot is apparently "on the wall" (low y
 * position, roughly below the hips and with reasonable confidence)
 * BUT there is no hold within 2 × hold.radius of that foot, while
 * at least one other limb IS in contact with a hold (body is
 * weighted and the smearing foot is load-bearing).
 *
 * Held for ≥ 300 ms.
 *
 * Limitation: we cannot actually see the wall surface — a foot in
 * the air below the hips looks the same as a foot smearing on blank
 * wall. We take the presence of another weighted limb as a proxy
 * for "the climber is ON the wall", which is conservative.
 */
export function detectSmear(
  poseTrack: PoseTrack,
  _phases: ReadonlyArray<MovementPhase>,
  holds: ReadonlyArray<Hold>,
): TechniqueEvent[] {
  const poses = poseTrack.poses2D;
  if (poses.length === 0) return [];
  const minFrames = msToFrames(300, poseTrack.fps);

  const leftHits: boolean[] = [];
  const rightHits: boolean[] = [];
  for (const pose of poses) {
    const k = pose.keypoints;
    const la = k[JOINT_INDEX.left_ankle];
    const ra = k[JOINT_INDEX.right_ankle];
    const lh = k[JOINT_INDEX.left_hip];
    const rh = k[JOINT_INDEX.right_hip];
    const lw = k[JOINT_INDEX.left_wrist];
    const rw = k[JOINT_INDEX.right_wrist];
    if (
      !la ||
      !ra ||
      !lh ||
      !rh ||
      !lw ||
      !rw ||
      [la, ra, lh, rh].some((p) => p.confidence < MIN_KP_CONFIDENCE)
    ) {
      leftHits.push(false);
      rightHits.push(false);
      continue;
    }
    const hipY = (lh.y + rh.y) / 2;
    // Proxy for "climber is on the wall": at least one hand is within
    // the bounding box of any hold.
    const handOnHold =
      isNearAnyHold(lw.x, lw.y, holds, 1.4) || isNearAnyHold(rw.x, rw.y, holds, 1.4);
    if (!handOnHold) {
      leftHits.push(false);
      rightHits.push(false);
      continue;
    }

    const leftSmear =
      la.y > hipY &&
      !isNearAnyHold(la.x, la.y, holds, 2.0);
    leftHits.push(leftSmear);

    const rightSmear =
      ra.y > hipY &&
      !isNearAnyHold(ra.x, ra.y, holds, 2.0);
    rightHits.push(rightSmear);
  }

  const out: TechniqueEvent[] = [];
  for (const [s, e] of findRuns(leftHits, minFrames)) {
    out.push(
      eventFromRun({
        kind: 'smear',
        track: poseTrack,
        startIdx: s,
        endIdx: e,
        confidence: 0.35,
        evidence: 'Left foot positioned on the wall with no hold nearby while the body is weighted.',
        involvedLimbs: ['left_foot'],
      }),
    );
  }
  for (const [s, e] of findRuns(rightHits, minFrames)) {
    out.push(
      eventFromRun({
        kind: 'smear',
        track: poseTrack,
        startIdx: s,
        endIdx: e,
        confidence: 0.35,
        evidence: 'Right foot positioned on the wall with no hold nearby while the body is weighted.',
        involvedLimbs: ['right_foot'],
      }),
    );
  }
  return mergeAdjacent(out);
}

function isNearAnyHold(
  x: number,
  y: number,
  holds: ReadonlyArray<Hold>,
  radiusMult: number,
): boolean {
  for (const h of holds) {
    const d = Math.hypot(x - h.position.x, y - h.position.y);
    if (d <= h.radius * radiusMult) return true;
  }
  return false;
}
