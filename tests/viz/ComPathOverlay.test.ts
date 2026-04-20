/**
 * @testing-library/react-native is not installed in this project, so we
 * test the overlay via its pure geometry helper: `computeFadingSegments`
 * fed with the same shape of data `ComPathOverlay` receives.
 *
 * This gives us confidence that the overlay would render the expected
 * segments without pulling in a react-native test renderer.
 */

import type { AnalyticsTrack, FrameAnalytics } from '@domain/models';

import {
  computeFadingSegments,
  extractCom2D,
} from '../../src/viz/overlay2d/helpers';

function mkFrame(ts: number, x: number, y: number): FrameAnalytics {
  return {
    frame: Math.floor(ts / 33),
    timestampMs: ts,
    com2D: { x, y },
    hip2D: { x, y },
    comInsideSupport: true,
    bodySwingDegPerSec: 0,
    confidence: 0.9,
  };
}

function mkTrack(fps: number, perFrame: ReadonlyArray<FrameAnalytics>): AnalyticsTrack {
  return { fps, perFrame };
}

describe('ComPathOverlay segment builder (via helper)', () => {
  it('produces N-1 segments when all frames fall inside the window', () => {
    const track = mkTrack(30, [
      mkFrame(0, 0.0, 0.0),
      mkFrame(100, 0.1, 0.1),
      mkFrame(200, 0.2, 0.1),
      mkFrame(300, 0.3, 0.1),
    ]);
    const segs = computeFadingSegments(track.perFrame, 150, 3000, extractCom2D);
    expect(segs.length).toBe(3);
  });

  it('produces no segments when perFrame is empty', () => {
    const track = mkTrack(30, []);
    const segs = computeFadingSegments(track.perFrame, 0, 3000, extractCom2D);
    expect(segs).toEqual([]);
  });

  it('clips segments outside the ±window around currentMs', () => {
    const pts: FrameAnalytics[] = [];
    for (let t = 0; t <= 10_000; t += 100) {
      pts.push(mkFrame(t, t / 10_000, 0.5));
    }
    const track = mkTrack(30, pts);
    // current=5000, window=3000 → keep segs whose mid in [2000..8000]
    const segs = computeFadingSegments(track.perFrame, 5000, 3000, extractCom2D);
    // ~60 segments in range (mid ∈ [2050..7950] stepping by 100)
    expect(segs.length).toBeGreaterThan(40);
    expect(segs.length).toBeLessThan(70);
  });

  it('emits coordinates in [0,1] matching the input positions', () => {
    const track = mkTrack(30, [
      mkFrame(0, 0.25, 0.75),
      mkFrame(100, 0.5, 0.5),
    ]);
    const [seg] = computeFadingSegments(track.perFrame, 50, 1000, extractCom2D);
    expect(seg.x1).toBeCloseTo(0.25);
    expect(seg.y1).toBeCloseTo(0.75);
    expect(seg.x2).toBeCloseTo(0.5);
    expect(seg.y2).toBeCloseTo(0.5);
  });
});
