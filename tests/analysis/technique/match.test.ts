import { detectMatch } from '@analysis/technique/match';
import { JOINT_INDEX } from '@domain/models';

import { emptyTrack, handHold, kp, makeTrack, neutralPose, repeatedPoses } from './_fixtures';

describe('detectMatch', () => {
  const hold = handHold('h_m', 0.5, 0.2, 0.06);

  it('fires when both wrists are within the same hold for ≥ 200ms', () => {
    const poses = repeatedPoses((frame, ms) => {
      return neutralPose(frame, ms, {
        [JOINT_INDEX.left_wrist]: kp(0.49, 0.21, 0.95),
        [JOINT_INDEX.right_wrist]: kp(0.51, 0.2, 0.95),
      });
    }, 400, 30);
    const track = makeTrack(poses);
    const events = detectMatch(track, [], [hold]);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].kind).toBe('match');
    expect(events[0].involvedLimbs).toEqual(['left_hand', 'right_hand']);
  });

  it('does not fire when only one hand overlaps the hold', () => {
    const poses = repeatedPoses((frame, ms) => {
      return neutralPose(frame, ms, {
        [JOINT_INDEX.left_wrist]: kp(0.49, 0.21, 0.95),
        [JOINT_INDEX.right_wrist]: kp(0.8, 0.5, 0.95),
      });
    }, 400, 30);
    const track = makeTrack(poses);
    const events = detectMatch(track, [], [hold]);
    expect(events).toHaveLength(0);
  });

  it('returns [] on empty pose track', () => {
    expect(detectMatch(emptyTrack(), [], [hold])).toEqual([]);
  });
});
