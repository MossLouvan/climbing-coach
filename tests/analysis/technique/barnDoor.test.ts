import { detectBarnDoor } from '@analysis/technique/barnDoor';
import { JOINT_INDEX } from '@domain/models';

import { emptyTrack, kp, makeTrack, neutralPose, repeatedPoses } from './_fixtures';

describe('detectBarnDoor', () => {
  it('fires when torso rotates fast enough (> 60 deg/s) for ≥ 200ms', () => {
    // 30 fps, rotate shoulders by ~4 deg per frame = 120 deg/s
    const poses = repeatedPoses((frame, ms) => {
      const theta = (frame * 4 * Math.PI) / 180; // radians
      // Rotate the shoulder axis around hip center
      const r = 0.1;
      const cx = 0.5;
      const cy = 0.3;
      const ls = kp(cx - r * Math.cos(theta), cy - r * Math.sin(theta), 0.95);
      const rs = kp(cx + r * Math.cos(theta), cy + r * Math.sin(theta), 0.95);
      return neutralPose(frame, ms, {
        [JOINT_INDEX.left_shoulder]: ls,
        [JOINT_INDEX.right_shoulder]: rs,
      });
    }, 400, 30);
    const track = makeTrack(poses);
    const events = detectBarnDoor(track, [], []);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].kind).toBe('barn_door');
  });

  it('does not fire for slow, steady rotation (< 60 deg/s)', () => {
    // 1 deg per frame at 30fps = 30 deg/s, well below threshold
    const poses = repeatedPoses((frame, ms) => {
      const theta = (frame * 1 * Math.PI) / 180;
      const r = 0.1;
      const cx = 0.5;
      const cy = 0.3;
      return neutralPose(frame, ms, {
        [JOINT_INDEX.left_shoulder]: kp(cx - r * Math.cos(theta), cy - r * Math.sin(theta), 0.95),
        [JOINT_INDEX.right_shoulder]: kp(cx + r * Math.cos(theta), cy + r * Math.sin(theta), 0.95),
      });
    }, 400, 30);
    const track = makeTrack(poses);
    const events = detectBarnDoor(track, [], []);
    expect(events).toHaveLength(0);
  });

  it('returns [] on empty pose track', () => {
    expect(detectBarnDoor(emptyTrack(), [], [])).toEqual([]);
  });
});
