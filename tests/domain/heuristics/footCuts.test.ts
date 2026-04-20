import { footCutsScore } from '@domain/scoring/heuristics/footCuts';
import type { Pose2D } from '@domain/models';

import { buildPose2D, footHold, makePhase, makeTrack } from './fixtures';

describe('footCutsScore', () => {
  const shoulder = { x: 0.5, y: 0.3 };
  const hip = { x: 0.5, y: 0.55 };
  const footOn = { x: 0.5, y: 0.9 };
  const fOnLeft = footHold('foot_L', 0.4, 0.9);
  const fOnRight = footHold('foot_R', 0.6, 0.9);

  function feetOnPoses(n = 20): Pose2D[] {
    return Array.from({ length: n }, (_, i) =>
      buildPose2D(i, (i * 1000) / 30, {
        hip,
        foot: footOn,
        shoulder,
        leftAnkle: { x: 0.4, y: 0.9 },
        rightAnkle: { x: 0.6, y: 0.9 },
      }),
    );
  }

  function feetOffPoses(n = 20): Pose2D[] {
    return Array.from({ length: n }, (_, i) =>
      buildPose2D(i, (i * 1000) / 30, {
        hip,
        foot: { x: 0.5, y: 0.6 }, // swung up, way from the foot holds
        shoulder,
        leftAnkle: { x: 0.3, y: 0.4 },
        rightAnkle: { x: 0.7, y: 0.4 },
      }),
    );
  }

  it('low-skill: feet off the wall on a static phase yields a low score + tip', () => {
    const track = makeTrack(feetOffPoses(20));
    const phase = makePhase('weight_shift', 0, 19);
    const res = footCutsScore({
      track,
      holds: [fOnLeft, fOnRight],
      phases: [phase],
    });
    expect(res.score).toBeLessThan(35);
    expect(Number.isFinite(res.score)).toBe(true);
  });

  it('high-skill: feet on the wall throughout static phases → high score', () => {
    const track = makeTrack(feetOnPoses(20));
    const phase = makePhase('weight_shift', 0, 19);
    const res = footCutsScore({
      track,
      holds: [fOnLeft, fOnRight],
      phases: [phase],
    });
    expect(res.score).toBeGreaterThanOrEqual(90);
  });

  it('ignores dyno phases — feet allowed off the wall there', () => {
    const track = makeTrack(feetOffPoses(15));
    const phase = makePhase('dyno', 0, 14);
    const res = footCutsScore({
      track,
      holds: [fOnLeft, fOnRight],
      phases: [phase],
    });
    // Dynos are excluded, so nothing examined — neutral band.
    expect(res.score).toBeGreaterThanOrEqual(60);
    expect(res.score).toBeLessThanOrEqual(100);
  });

  it('returns a bounded score when no poses are available', () => {
    const res = footCutsScore({
      track: makeTrack([]),
      holds: [fOnLeft, fOnRight],
      phases: [],
    });
    expect(res.score).toBeGreaterThanOrEqual(0);
    expect(res.score).toBeLessThanOrEqual(100);
  });

  it('survives missing analytics', () => {
    const track = makeTrack(feetOnPoses(5));
    const phase = makePhase('setup', 0, 4);
    const res = footCutsScore({
      track,
      holds: [fOnLeft, fOnRight],
      phases: [phase],
      analytics: undefined,
    });
    expect(Number.isFinite(res.score)).toBe(true);
  });
});
