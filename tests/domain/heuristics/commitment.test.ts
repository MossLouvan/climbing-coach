import { commitmentOnDynosScore } from '@domain/scoring/heuristics/commitment';
import type { Pose2D } from '@domain/models';

import { buildPose2D, handHold, footHold, makePhase, makeTrack } from './fixtures';

describe('commitmentOnDynosScore', () => {
  const shoulder = { x: 0.5, y: 0.3 };
  const foot = { x: 0.5, y: 0.9 };
  const supportHold = footHold('support', 0.5, 0.9);
  const targetHold = handHold('target', 0.6, 0.3);

  function dynoPoses(peakDisplacement: number, n = 10): Pose2D[] {
    // Climber CoM moves peakDisplacement normalized units between adjacent
    // mid-frames (fast motion spike).
    const poses: Pose2D[] = [];
    for (let i = 0; i < n; i++) {
      const t = (i * 1000) / 30;
      // Give the middle frames a big displacement vs neighbors.
      const mid = Math.floor(n / 2);
      let hipY = 0.55;
      if (i === mid) hipY = 0.55 - peakDisplacement;
      if (i === mid + 1) hipY = 0.55 - peakDisplacement * 0.8;
      poses.push(
        buildPose2D(i, t, {
          hip: { x: 0.5, y: hipY },
          foot: { x: 0.5, y: 0.9 },
          shoulder: { x: 0.5, y: hipY - 0.2 },
        }),
      );
    }
    return poses;
  }

  it('low-skill: weak throw (small peak CoM velocity) yields a low score + tip', () => {
    const poses = dynoPoses(0.02); // tiny displacement → weak throw
    const track = makeTrack(poses);
    const phase = makePhase('dyno', 0, 9, {
      supportingHoldIds: [supportHold.id],
      targetHoldIds: [targetHold.id],
    });
    const res = commitmentOnDynosScore({
      track,
      holds: [supportHold, targetHold],
      phases: [phase],
    });
    expect(res.score).toBeLessThan(55);
    expect(Number.isFinite(res.score)).toBe(true);
  });

  it('high-skill: hard committing throw yields a high score', () => {
    const poses = dynoPoses(0.2); // big displacement → strong throw
    // Shrink reach distance so normalized speed is high.
    const shortSupport = footHold('s', 0.5, 0.35);
    const shortTarget = handHold('t', 0.52, 0.33);
    const track = makeTrack(poses);
    const phase = makePhase('dyno', 0, 9, {
      supportingHoldIds: [shortSupport.id],
      targetHoldIds: [shortTarget.id],
    });
    const res = commitmentOnDynosScore({
      track,
      holds: [shortSupport, shortTarget],
      phases: [phase],
    });
    expect(res.score).toBeGreaterThanOrEqual(85);
  });

  it('no dynos → neutral N/A score (not NaN, not zero)', () => {
    const poses: Pose2D[] = Array.from({ length: 6 }, (_, i) =>
      buildPose2D(i, (i * 1000) / 30, {
        hip: { x: 0.5, y: 0.55 },
        foot,
        shoulder,
      }),
    );
    const phase = makePhase('setup', 0, 5);
    const res = commitmentOnDynosScore({
      track: makeTrack(poses),
      holds: [supportHold, targetHold],
      phases: [phase],
    });
    expect(res.score).toBeGreaterThan(50);
    expect(res.score).toBeLessThanOrEqual(100);
  });

  it('empty pose track returns bounded score without throwing', () => {
    const res = commitmentOnDynosScore({
      track: makeTrack([]),
      holds: [supportHold, targetHold],
      phases: [makePhase('dyno', 0, 4)],
    });
    expect(Number.isFinite(res.score)).toBe(true);
    expect(res.score).toBeGreaterThanOrEqual(0);
    expect(res.score).toBeLessThanOrEqual(100);
  });

  it('survives missing analytics', () => {
    const poses = dynoPoses(0.1);
    const track = makeTrack(poses);
    const phase = makePhase('dyno', 0, 9, {
      supportingHoldIds: [supportHold.id],
      targetHoldIds: [targetHold.id],
    });
    const res = commitmentOnDynosScore({
      track,
      holds: [supportHold, targetHold],
      phases: [phase],
      analytics: undefined,
    });
    expect(Number.isFinite(res.score)).toBe(true);
  });
});
