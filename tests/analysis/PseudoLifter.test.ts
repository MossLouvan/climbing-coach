import { MockPoseProvider } from '@analysis/pose/MockPoseProvider';
import { PseudoLifter } from '@analysis/lifting/PseudoLifter';
import { JOINT_INDEX, JOINT_NAMES } from '@domain/models';

describe('PseudoLifter', () => {
  it('returns one Pose3D per input Pose2D with the same frame indices', async () => {
    const p = await new MockPoseProvider({ durationSec: 1, seed: 7 }).infer({
      videoUri: 'x',
      widthPx: 720,
      heightPx: 1280,
      targetFps: 10,
    });
    const lifter = new PseudoLifter({ heightM: 1.75 });
    const track = lifter.lift({
      fps: p.fps,
      widthPx: p.widthPx,
      heightPx: p.heightPx,
      poses2D: p.poses2D,
    });
    expect(track.poses3D.length).toBe(p.poses2D.length);
    for (let i = 0; i < track.poses3D.length; i++) {
      expect(track.poses3D[i].frame).toBe(p.poses2D[i].frame);
      expect(track.poses3D[i].joints.length).toBe(JOINT_NAMES.length);
    }
  });

  it('places hips near origin (z ~ 0 reference frame)', async () => {
    const p = await new MockPoseProvider({ durationSec: 1 }).infer({
      videoUri: 'x',
      widthPx: 720,
      heightPx: 1280,
      targetFps: 5,
    });
    const track = new PseudoLifter({ heightM: 1.8 }).lift({
      fps: p.fps,
      widthPx: p.widthPx,
      heightPx: p.heightPx,
      poses2D: p.poses2D,
    });
    for (const pose of track.poses3D) {
      const lh = pose.joints[JOINT_INDEX.left_hip];
      const rh = pose.joints[JOINT_INDEX.right_hip];
      expect(Math.abs(lh.z)).toBeLessThan(0.05);
      expect(Math.abs(rh.z)).toBeLessThan(0.05);
    }
  });

  it('pushes elbows AWAY from wall (+z) consistent with climbing prior', async () => {
    const p = await new MockPoseProvider({ durationSec: 1 }).infer({
      videoUri: 'x',
      widthPx: 720,
      heightPx: 1280,
      targetFps: 5,
    });
    const track = new PseudoLifter({ heightM: 1.75 }).lift({
      fps: p.fps,
      widthPx: p.widthPx,
      heightPx: p.heightPx,
      poses2D: p.poses2D,
    });
    // Over the whole clip, mean elbow z should be >= 0.
    let sum = 0;
    let n = 0;
    for (const pose of track.poses3D) {
      sum += pose.joints[JOINT_INDEX.left_elbow].z;
      sum += pose.joints[JOINT_INDEX.right_elbow].z;
      n += 2;
    }
    expect(sum / n).toBeGreaterThanOrEqual(0);
  });

  it('produces lift-confidences in [0, 1]', async () => {
    const p = await new MockPoseProvider({ durationSec: 1 }).infer({
      videoUri: 'x',
      widthPx: 720,
      heightPx: 1280,
      targetFps: 5,
    });
    const track = new PseudoLifter().lift({
      fps: p.fps,
      widthPx: p.widthPx,
      heightPx: p.heightPx,
      poses2D: p.poses2D,
    });
    for (const pose of track.poses3D) {
      expect(pose.liftConfidence).toBeGreaterThanOrEqual(0);
      expect(pose.liftConfidence).toBeLessThanOrEqual(1);
    }
  });
});
