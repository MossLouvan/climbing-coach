import { detectFootCut } from '@analysis/technique/footCut';
import { JOINT_INDEX } from '@domain/models';

import { emptyTrack, footHold, kp, makeTrack, neutralPose, phase, repeatedPoses } from './_fixtures';

describe('detectFootCut', () => {
  const foot = footHold('h_fx', 0.5, 0.9, 0.04);

  it('fires when both feet lose contact outside a dyno phase for ≥ 100ms', () => {
    // All ankles far from any hold
    const poses = repeatedPoses((frame, ms) => {
      return neutralPose(frame, ms, {
        [JOINT_INDEX.left_ankle]: kp(0.2, 0.4, 0.95),
        [JOINT_INDEX.right_ankle]: kp(0.8, 0.4, 0.95),
      });
    }, 300, 30);
    const track = makeTrack(poses);
    const events = detectFootCut(track, [], [foot]);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].kind).toBe('foot_cut');
  });

  it('does not fire when the frames are inside a dyno phase', () => {
    const poses = repeatedPoses((frame, ms) => {
      return neutralPose(frame, ms, {
        [JOINT_INDEX.left_ankle]: kp(0.2, 0.4, 0.95),
        [JOINT_INDEX.right_ankle]: kp(0.8, 0.4, 0.95),
      });
    }, 300, 30);
    const track = makeTrack(poses);
    // Full-range dyno phase covers every frame
    const phases = [phase('dyno', 0, track.poses2D[track.poses2D.length - 1].frame)];
    const events = detectFootCut(track, phases, [foot]);
    expect(events).toHaveLength(0);
  });

  it('returns [] on empty pose track', () => {
    expect(detectFootCut(emptyTrack(), [], [foot])).toEqual([]);
  });
});
