import { detectBackstep } from '@analysis/technique/backstep';
import { JOINT_INDEX } from '@domain/models';

import { emptyTrack, footHold, kp, makeTrack, neutralPose, repeatedPoses } from './_fixtures';

describe('detectBackstep', () => {
  it('fires when the right foot is on a hold to the LEFT of the hip line', () => {
    // Put foot hold on climber's left side, hip centered
    const hold = footHold('h_fl', 0.35, 0.9);
    const poses = repeatedPoses((frame, ms) => {
      return neutralPose(frame, ms, {
        // Hips centered around 0.5
        [JOINT_INDEX.left_hip]: kp(0.46, 0.55, 0.95),
        [JOINT_INDEX.right_hip]: kp(0.54, 0.55, 0.95),
        // Right ankle on the LEFT hold
        [JOINT_INDEX.right_ankle]: kp(0.35, 0.9, 0.95),
        // Left ankle off to the side (does not matter for right-foot backstep)
        [JOINT_INDEX.left_ankle]: kp(0.6, 0.9, 0.95),
      });
    }, 500, 30);
    const track = makeTrack(poses);
    const events = detectBackstep(track, [], [hold]);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].kind).toBe('backstep');
    expect(events[0].involvedLimbs).toEqual(['right_foot']);
  });

  it('does not fire when the foot is on its own side', () => {
    const hold = footHold('h_fr', 0.65, 0.9);
    const poses = repeatedPoses((frame, ms) => {
      return neutralPose(frame, ms, {
        [JOINT_INDEX.right_ankle]: kp(0.65, 0.9, 0.95),
      });
    }, 500, 30);
    const track = makeTrack(poses);
    const events = detectBackstep(track, [], [hold]);
    expect(events).toHaveLength(0);
  });

  it('returns [] on empty pose track', () => {
    expect(detectBackstep(emptyTrack(), [], [])).toEqual([]);
  });
});
