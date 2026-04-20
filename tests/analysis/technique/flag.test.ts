import { detectFlag } from '@analysis/technique/flag';
import { JOINT_INDEX } from '@domain/models';

import { emptyTrack, footHold, kp, makeTrack, neutralPose, repeatedPoses } from './_fixtures';

describe('detectFlag', () => {
  const foot = footHold('h_foot_l', 0.4, 0.9);
  const holds = [foot];

  it('fires when one foot is grounded and the other is extended for > 400ms', () => {
    const poses = repeatedPoses((frame, ms) => {
      return neutralPose(frame, ms, {
        // Left foot on the hold
        [JOINT_INDEX.left_ankle]: kp(0.4, 0.9, 0.95),
        // Right foot extended to the right of body, no hold near
        [JOINT_INDEX.right_ankle]: kp(0.8, 0.9, 0.95),
        // Hips
        [JOINT_INDEX.left_hip]: kp(0.46, 0.55),
        [JOINT_INDEX.right_hip]: kp(0.54, 0.55),
      });
    }, 600, 30);
    const track = makeTrack(poses);
    const events = detectFlag(track, [], holds);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].kind).toBe('flag');
    expect(events[0].involvedLimbs).toEqual(['right_foot']);
  });

  it('does not fire when both feet are grounded', () => {
    const both = footHold('h_foot_r', 0.6, 0.9);
    const poses = repeatedPoses((frame, ms) => {
      return neutralPose(frame, ms, {
        [JOINT_INDEX.left_ankle]: kp(0.4, 0.9, 0.95),
        [JOINT_INDEX.right_ankle]: kp(0.6, 0.9, 0.95),
      });
    }, 600, 30);
    const track = makeTrack(poses);
    const events = detectFlag(track, [], [foot, both]);
    expect(events).toHaveLength(0);
  });

  it('returns [] on an empty pose track without throwing', () => {
    expect(() => detectFlag(emptyTrack(), [], holds)).not.toThrow();
    expect(detectFlag(emptyTrack(), [], holds)).toEqual([]);
  });
});
