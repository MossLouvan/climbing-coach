import { MockPoseProvider } from '@analysis/pose/MockPoseProvider';
import { JOINT_NAMES } from '@domain/models';

describe('MockPoseProvider', () => {
  it('produces a deterministic track matching the JOINT_NAMES layout', async () => {
    const p = new MockPoseProvider({ seed: 1, durationSec: 2 });
    const r = await p.infer({
      videoUri: 'x',
      widthPx: 1080,
      heightPx: 1920,
      targetFps: 10,
    });
    expect(r.isRealInference).toBe(false);
    expect(r.poses2D.length).toBeGreaterThan(0);
    for (const pose of r.poses2D) {
      expect(pose.keypoints.length).toBe(JOINT_NAMES.length);
      for (const kp of pose.keypoints) {
        expect(kp.x).toBeGreaterThanOrEqual(0);
        expect(kp.x).toBeLessThanOrEqual(1);
        expect(kp.y).toBeGreaterThanOrEqual(0);
        expect(kp.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is deterministic for the same seed', async () => {
    const a = new MockPoseProvider({ seed: 42, durationSec: 1 });
    const b = new MockPoseProvider({ seed: 42, durationSec: 1 });
    const [ra, rb] = await Promise.all([
      a.infer({ videoUri: 'x', widthPx: 100, heightPx: 200, targetFps: 10 }),
      b.infer({ videoUri: 'x', widthPx: 100, heightPx: 200, targetFps: 10 }),
    ]);
    expect(ra.poses2D[5].keypoints[9].x).toBeCloseTo(rb.poses2D[5].keypoints[9].x, 8);
  });

  it('reports progress', async () => {
    const p = new MockPoseProvider({ seed: 1, durationSec: 2 });
    const events: number[] = [];
    await p.infer(
      { videoUri: 'x', widthPx: 100, heightPx: 200, targetFps: 10 },
      (e) => events.push(e.framesProcessed),
    );
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1]).toBeGreaterThan(0);
  });
});
