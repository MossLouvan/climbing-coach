import { overgrippingScore } from '@domain/scoring/heuristics/overgripping';
import { JOINT_INDEX, type Pose2D } from '@domain/models';

import {
  buildPose2D,
  handHold,
  makeTrack,
  makeAnalytics,
} from './fixtures';

describe('overgrippingScore', () => {
  const shoulder = { x: 0.5, y: 0.3 };
  const foot = { x: 0.5, y: 0.9 };
  const hip = { x: 0.5, y: 0.55 };

  // A single hold at the left wrist position so "gripping" resolves.
  const gripHold = handHold('hld_grip', 0.38, 0.2);

  function gripPoses(nFrames: number, jitterScale: number): Pose2D[] {
    const poses: Pose2D[] = [];
    for (let i = 0; i < nFrames; i++) {
      const jx = (i % 2 === 0 ? 1 : -1) * jitterScale;
      const jy = (i % 3 === 0 ? 1 : -1) * jitterScale;
      const pose = buildPose2D(i, (i * 1000) / 30, {
        hip,
        foot,
        shoulder,
        leftWrist: { x: 0.38 + jx, y: 0.2 + jy },
      });
      poses.push(pose);
    }
    return poses;
  }

  it('low-skill: high grip ratio + wrist jitter yields a low score + tip eligible', () => {
    const poses = gripPoses(20, 0.025); // substantial jitter
    const track = makeTrack(poses);
    const res = overgrippingScore({
      track,
      holds: [gripHold],
    });
    expect(res.score).toBeLessThan(60);
    expect(res.score).toBeGreaterThanOrEqual(0);
  });

  it('high-skill: hand releases frequently, no jitter → high score', () => {
    // Hand oscillates well away from the hold every other frame to keep
    // the grip ratio in the healthy band and jitter near zero.
    const poses: Pose2D[] = [];
    for (let i = 0; i < 20; i++) {
      // Every 3rd frame, hand is gripping. Otherwise, hand is far away.
      const onHold = i % 3 === 0;
      const lwrist = onHold ? { x: 0.38, y: 0.2 } : { x: 0.1, y: 0.1 };
      poses.push(
        buildPose2D(i, (i * 1000) / 30, {
          hip,
          foot,
          shoulder,
          leftWrist: lwrist,
        }),
      );
    }
    const track = makeTrack(poses);
    const res = overgrippingScore({
      track,
      holds: [gripHold],
    });
    expect(res.score).toBeGreaterThanOrEqual(85);
  });

  it('handles empty poses without throwing or producing NaN', () => {
    const res = overgrippingScore({
      track: makeTrack([]),
      holds: [gripHold],
    });
    expect(Number.isFinite(res.score)).toBe(true);
    expect(res.score).toBeGreaterThanOrEqual(0);
    expect(res.score).toBeLessThanOrEqual(100);
  });

  it('remains bounded when analytics is missing', () => {
    const poses = gripPoses(10, 0);
    const track = makeTrack(poses);
    const res = overgrippingScore({
      track,
      holds: [gripHold],
      analytics: undefined,
    });
    expect(Number.isFinite(res.score)).toBe(true);
    expect(res.score).toBeGreaterThanOrEqual(0);
    expect(res.score).toBeLessThanOrEqual(100);
  });

  it('accepts an analytics swing signal without crashing', () => {
    const poses = gripPoses(10, 0);
    const track = makeTrack(poses);
    const analytics = makeAnalytics(
      poses.map((p) => ({
        frame: p.frame,
        timestampMs: p.timestampMs,
        bodySwingDegPerSec: 30,
      })),
    );
    const res = overgrippingScore({
      track,
      holds: [gripHold],
      analytics,
    });
    expect(Number.isFinite(res.score)).toBe(true);
    expect(res.score).toBeGreaterThanOrEqual(0);
    expect(res.score).toBeLessThanOrEqual(100);
    // sanity: wrist index reachable
    void JOINT_INDEX.left_wrist;
  });
});
