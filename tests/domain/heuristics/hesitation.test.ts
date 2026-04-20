import { hesitationScore } from '@domain/scoring/heuristics/hesitation';
import type { Pose2D } from '@domain/models';

import { buildPose2D, handHold, makeTrack } from './fixtures';

describe('hesitationScore', () => {
  const shoulder = { x: 0.5, y: 0.3 };
  const foot = { x: 0.5, y: 0.9 };
  const hip0 = { x: 0.5, y: 0.55 };
  const gripHold = handHold('hld_grip', 0.38, 0.2);

  it('low-skill: long stall while gripping yields a low score', () => {
    // 60 frames at 30 fps = 2s where hip/CoM don't move and a hand is
    // on the hold → clear hesitation.
    const poses: Pose2D[] = [];
    for (let i = 0; i < 60; i++) {
      poses.push(
        buildPose2D(i, (i * 1000) / 30, {
          hip: hip0,
          foot,
          shoulder,
          leftWrist: { x: 0.38, y: 0.2 }, // glued to hold
        }),
      );
    }
    const track = makeTrack(poses);
    const res = hesitationScore({ track, holds: [gripHold] });
    expect(res.score).toBeLessThan(70);
    expect(Number.isFinite(res.score)).toBe(true);
  });

  it('high-skill: steady motion with brief grip contact → high score', () => {
    // 60 frames, CoM moves smoothly each frame; no stall.
    const poses: Pose2D[] = [];
    for (let i = 0; i < 60; i++) {
      const progress = i / 59;
      const hip = { x: 0.4 + progress * 0.2, y: 0.55 };
      poses.push(
        buildPose2D(i, (i * 1000) / 30, {
          hip,
          foot: { x: 0.4 + progress * 0.2, y: 0.9 },
          shoulder: { x: 0.4 + progress * 0.2, y: 0.3 },
          leftWrist: i % 10 === 0 ? { x: 0.38, y: 0.2 } : { x: 0.1, y: 0.1 },
        }),
      );
    }
    const track = makeTrack(poses);
    const res = hesitationScore({ track, holds: [gripHold] });
    expect(res.score).toBeGreaterThanOrEqual(85);
  });

  it('is bounded on too-short pose tracks', () => {
    const poses: Pose2D[] = [
      buildPose2D(0, 0, { hip: hip0, foot, shoulder }),
      buildPose2D(1, 33, { hip: hip0, foot, shoulder }),
    ];
    const track = makeTrack(poses);
    const res = hesitationScore({ track, holds: [gripHold] });
    expect(res.score).toBeGreaterThanOrEqual(0);
    expect(res.score).toBeLessThanOrEqual(100);
  });

  it('survives missing analytics and missing phase', () => {
    const poses: Pose2D[] = Array.from({ length: 15 }, (_, i) =>
      buildPose2D(i, (i * 1000) / 30, { hip: hip0, foot, shoulder }),
    );
    const track = makeTrack(poses);
    const res = hesitationScore({ track, holds: [gripHold] });
    expect(Number.isFinite(res.score)).toBe(true);
  });
});
