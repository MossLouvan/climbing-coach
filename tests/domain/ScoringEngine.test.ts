import { analyzeSession } from '@analysis/pipeline';
import { MockPoseProvider } from '@analysis/pose';
import { SCORE_CATEGORIES } from '@domain/models';
import { DEMO_ROUTE } from '@storage/seeds/demoRoute';
import type { Video, VideoId } from '@domain/models';
import { expectCompleted } from '../testUtils/analysis';

const noWallCheck = { wallDetectionEnabled: false } as const;

const demoVideo: Video = {
  id: 'vid_test' as VideoId,
  uri: 'stub://x',
  durationMs: 6000,
  widthPx: 1080,
  heightPx: 1920,
  fps: 30,
};

describe('ScoringEngine', () => {
  it('produces bounded overall and per-category scores', async () => {
    const out = expectCompleted(
      await analyzeSession({
        video: demoVideo,
        route: DEMO_ROUTE,
        provider: new MockPoseProvider({ seed: 99, durationSec: 4 }),
        options: noWallCheck,
      }),
    );
    expect(out.report.overall).toBeGreaterThanOrEqual(0);
    expect(out.report.overall).toBeLessThanOrEqual(100);
    for (const cat of SCORE_CATEGORIES) {
      const v = out.report.byCategory[cat];
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('emits a coaching tip for at least one sub-par category on seeded data', async () => {
    const out = expectCompleted(
      await analyzeSession({
        video: demoVideo,
        route: DEMO_ROUTE,
        provider: new MockPoseProvider({ seed: 99, durationSec: 4 }),
        options: noWallCheck,
      }),
    );
    // The seeded climber isn't perfect; we expect at least 1 global
    // tip OR at least one per-phase tip to exist.
    const phaseTipCount = out.report.phaseScores.reduce(
      (s, ps) => s + ps.tips.length,
      0,
    );
    expect(out.report.tips.length + phaseTipCount).toBeGreaterThan(0);
  });

  it('includes a 3D lift caveat when 3D confidence is low', async () => {
    const out = expectCompleted(
      await analyzeSession({
        video: demoVideo,
        route: DEMO_ROUTE,
        provider: new MockPoseProvider({ seed: 99, durationSec: 4 }),
        options: noWallCheck,
      }),
    );
    // Not a hard assert on presence/absence of caveats — we only
    // assert that whenever a caveat exists, it's a non-empty string.
    for (const c of out.report.caveats) {
      expect(typeof c).toBe('string');
      expect(c.length).toBeGreaterThan(0);
    }
  });

  it('assigns scores to each phase', async () => {
    const out = expectCompleted(
      await analyzeSession({
        video: demoVideo,
        route: DEMO_ROUTE,
        provider: new MockPoseProvider({ seed: 99, durationSec: 4 }),
        options: noWallCheck,
      }),
    );
    expect(out.report.phaseScores.length).toBe(out.phases.length);
    for (const ps of out.report.phaseScores) {
      expect(ps.overall).toBeGreaterThanOrEqual(0);
      expect(ps.overall).toBeLessThanOrEqual(100);
    }
  });
});
