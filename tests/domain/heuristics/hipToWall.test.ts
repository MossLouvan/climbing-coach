import { hipToWallDistanceScore } from '@domain/scoring/heuristics/hipToWall';

import { buildPose2D, makeAnalytics, makePhase, makeTrack } from './fixtures';

describe('hipToWallDistanceScore', () => {
  const shoulder = { x: 0.5, y: 0.3 };
  const foot = { x: 0.5, y: 0.9 };
  const hip = { x: 0.5, y: 0.55 };

  function track(nFrames = 6) {
    const poses2D = [];
    for (let i = 0; i < nFrames; i++) {
      poses2D.push(buildPose2D(i, (i * 1000) / 30, { hip, foot, shoulder }));
    }
    return makeTrack(poses2D);
  }

  it('scores highly when hips stay near the wall', () => {
    const analytics = makeAnalytics(
      Array.from({ length: 6 }, (_, i) => ({
        frame: i,
        timestampMs: (i * 1000) / 30,
        hipToWallMeters: 0.05, // 5cm — close to wall
      })),
    );
    const res = hipToWallDistanceScore({ track: track(), analytics });
    expect(res.score).toBeGreaterThanOrEqual(85);
    expect(res.score).toBeLessThanOrEqual(100);
  });

  it('scores low when hips are bird-caged far off the wall', () => {
    const analytics = makeAnalytics(
      Array.from({ length: 8 }, (_, i) => ({
        frame: i,
        timestampMs: (i * 1000) / 30,
        hipToWallMeters: 0.55, // 55cm — bird-caged
      })),
    );
    const res = hipToWallDistanceScore({ track: track(8), analytics });
    expect(res.score).toBeLessThan(35);
    expect(res.score).toBeGreaterThanOrEqual(0);
  });

  it('respects a phase slice when one is provided', () => {
    const analytics = makeAnalytics([
      { frame: 0, timestampMs: 0, hipToWallMeters: 0.05 },
      { frame: 1, timestampMs: 33, hipToWallMeters: 0.05 },
      { frame: 2, timestampMs: 66, hipToWallMeters: 0.5 },
      { frame: 3, timestampMs: 100, hipToWallMeters: 0.5 },
    ]);
    const phase = makePhase('reach', 2, 3);
    const res = hipToWallDistanceScore({ phase, track: track(4), analytics });
    expect(res.score).toBeLessThan(50);
  });

  it('returns a bounded neutral score when analytics and 3D poses are missing', () => {
    const res = hipToWallDistanceScore({});
    expect(res.score).toBeGreaterThanOrEqual(0);
    expect(res.score).toBeLessThanOrEqual(100);
    expect(Number.isFinite(res.score)).toBe(true);
  });

  it('returns a bounded score on empty analytics without throwing', () => {
    const res = hipToWallDistanceScore({
      track: makeTrack([]),
      analytics: makeAnalytics([]),
    });
    expect(res.score).toBeGreaterThanOrEqual(0);
    expect(res.score).toBeLessThanOrEqual(100);
  });
});
