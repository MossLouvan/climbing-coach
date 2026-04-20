import { detectToeHook } from '@analysis/technique/toeHook';
import { JOINT_INDEX } from '@domain/models';

import { emptyTrack, footHold, kp, makeTrack, neutralPose, repeatedPoses } from './_fixtures';

describe('detectToeHook', () => {
  it('fires when ankle is above the knee with contact to a hold above the hips', () => {
    const hold = footHold('h_above', 0.55, 0.3, 0.06);
    const poses = repeatedPoses((frame, ms) => {
      return neutralPose(frame, ms, {
        // Ankle above knee
        [JOINT_INDEX.right_ankle]: kp(0.55, 0.3, 0.95),
        [JOINT_INDEX.right_knee]: kp(0.55, 0.5, 0.95),
        [JOINT_INDEX.left_hip]: kp(0.46, 0.55, 0.95),
        [JOINT_INDEX.right_hip]: kp(0.54, 0.55, 0.95),
      });
    }, 500, 30);
    const track = makeTrack(poses);
    const events = detectToeHook(track, [], [hold]);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].kind).toBe('toe_hook');
  });

  it('does not fire when ankle is below the knee (normal leg geometry)', () => {
    const hold = footHold('h_low', 0.55, 0.9, 0.05);
    const poses = repeatedPoses((frame, ms) => {
      return neutralPose(frame, ms, {
        [JOINT_INDEX.right_ankle]: kp(0.55, 0.9, 0.95),
        [JOINT_INDEX.right_knee]: kp(0.55, 0.7, 0.95),
      });
    }, 500, 30);
    const track = makeTrack(poses);
    const events = detectToeHook(track, [], [hold]);
    expect(events).toHaveLength(0);
  });

  it('returns [] on empty pose track', () => {
    expect(detectToeHook(emptyTrack(), [], [])).toEqual([]);
  });
});
