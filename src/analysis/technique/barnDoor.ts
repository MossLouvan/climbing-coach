import {
  JOINT_INDEX,
  type Hold,
  type MovementPhase,
  type PoseTrack,
  type TechniqueEvent,
} from '@domain/models';

import {
  eventFromRun,
  findRuns,
  framesToMs,
  mergeAdjacent,
  MIN_KP_CONFIDENCE,
  msToFrames,
} from './_helpers';

/**
 * Detect "barn door" — the body rotates around a single contact axis
 * faster than expected. We compute torso angular velocity here (not
 * elsewhere — this detector owns the signal) from the
 * left_shoulder → right_shoulder line, in degrees per second.
 *
 * Rule:
 *  - |dθ/dt| > 60 deg/sec sustained for ≥ 200 ms
 *
 * Limitation: 2D rotation rate conflates actual body spin with
 * camera-plane artifacts. Confidence is capped at 0.5.
 */
export function detectBarnDoor(
  poseTrack: PoseTrack,
  _phases: ReadonlyArray<MovementPhase>,
  _holds: ReadonlyArray<Hold>,
): TechniqueEvent[] {
  const poses = poseTrack.poses2D;
  if (poses.length < 2) return [];
  const fps = poseTrack.fps;
  const minFrames = msToFrames(200, fps);

  const angles: number[] = new Array(poses.length).fill(NaN);
  for (let i = 0; i < poses.length; i++) {
    const ls = poses[i].keypoints[JOINT_INDEX.left_shoulder];
    const rs = poses[i].keypoints[JOINT_INDEX.right_shoulder];
    if (
      !ls ||
      !rs ||
      ls.confidence < MIN_KP_CONFIDENCE ||
      rs.confidence < MIN_KP_CONFIDENCE
    ) {
      continue;
    }
    angles[i] = (Math.atan2(rs.y - ls.y, rs.x - ls.x) * 180) / Math.PI;
  }

  const hits: boolean[] = new Array(poses.length).fill(false);
  for (let i = 1; i < poses.length; i++) {
    const a0 = angles[i - 1];
    const a1 = angles[i];
    if (Number.isNaN(a0) || Number.isNaN(a1)) continue;
    let d = a1 - a0;
    // Wrap to [-180, 180]
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    const degPerSec = Math.abs(d) * fps;
    if (degPerSec > 60) hits[i] = true;
  }

  const out: TechniqueEvent[] = [];
  for (const [s, e] of findRuns(hits, minFrames)) {
    const duration = framesToMs(e - s + 1, fps);
    out.push(
      eventFromRun({
        kind: 'barn_door',
        track: poseTrack,
        startIdx: s,
        endIdx: e,
        confidence: Math.min(0.5, 0.2 + duration / 2000),
        evidence: 'Torso rotation rate exceeded 60 deg/sec — body swung open from the wall.',
      }),
    );
  }
  return mergeAdjacent(out);
}
