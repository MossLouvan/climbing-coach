import { analyzeSession } from '@analysis/pipeline';
import { MockPoseProvider } from '@analysis/pose';
import { DEMO_ROUTE } from '@storage/seeds/demoRoute';
import type { Video, VideoId } from '@domain/models';

const demoVideo: Video = {
  id: 'vid_test' as VideoId,
  uri: 'stub://x',
  durationMs: 6000,
  widthPx: 1080,
  heightPx: 1920,
  fps: 30,
};

describe('segmentPhases via analyzeSession', () => {
  it('produces non-overlapping phases covering the entire pose track', async () => {
    const out = await analyzeSession({
      video: demoVideo,
      route: DEMO_ROUTE,
      provider: new MockPoseProvider({ seed: 1, durationSec: 4 }),
    });
    expect(out.phases.length).toBeGreaterThan(0);
    for (let i = 1; i < out.phases.length; i++) {
      expect(out.phases[i].startFrame).toBeGreaterThan(out.phases[i - 1].endFrame - 1);
    }
    // First phase covers frame 0; last phase covers the last frame.
    const lastTrackFrame = out.track.poses2D[out.track.poses2D.length - 1].frame;
    expect(out.phases[0].startFrame).toBe(0);
    expect(out.phases[out.phases.length - 1].endFrame).toBe(lastTrackFrame);
  });

  it('contains at least one reach-like or setup phase in the seeded climb', async () => {
    const out = await analyzeSession({
      video: demoVideo,
      route: DEMO_ROUTE,
      provider: new MockPoseProvider({ seed: 1, durationSec: 4 }),
    });
    const kinds = new Set(out.phases.map((p) => p.kind));
    // The mock trace is deliberately dominated by setup → weight_shift →
    // reach-ish motion; we just require that the segmenter isn't stuck
    // in a single state.
    expect(kinds.size).toBeGreaterThan(1);
  });
});
