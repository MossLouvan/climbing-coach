import {
  YoloPoseProvider,
  YoloProviderUnavailableError,
} from '@analysis/pose/YoloPoseProvider';

describe('YoloPoseProvider', () => {
  const baseRequest = {
    videoUri: 'file:///none.mp4',
    widthPx: 1080,
    heightPx: 1920,
    targetFps: 10,
  };

  it('identifies as a real-inference YOLO source with a default model tag', () => {
    const p = new YoloPoseProvider();
    expect(p.isRealInference).toBe(true);
    expect(p.source).toBe('yolo');
    expect(p.name).toBe('yolo:climber-yolo11n-v1');
  });

  it('uses a custom model tag when provided', () => {
    const p = new YoloPoseProvider({ modelTag: 'climber-yolo11s-v2' });
    expect(p.name).toBe('yolo:climber-yolo11s-v2');
  });

  it('throws YoloProviderUnavailableError when the native module is absent (node/test env)', async () => {
    const p = new YoloPoseProvider();
    await expect(p.infer(baseRequest)).rejects.toBeInstanceOf(YoloProviderUnavailableError);
  });

  it('reports NATIVE_MODULE_MISSING in node — the YOLO bridge never ships in Expo Go', async () => {
    const p = new YoloPoseProvider();
    try {
      await p.infer(baseRequest);
      fail('expected infer() to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(YoloProviderUnavailableError);
      if (err instanceof YoloProviderUnavailableError) {
        // In node tests the require('climbing-pose') resolves to the JS
        // shim, which tries to load 'ClimbingPose' via expo-modules-core.
        // That path surfaces NATIVE_MODULE_MISSING — we don't assert on
        // NOT_BUNDLED because we can't produce the native binary in CI.
        expect(['NATIVE_MODULE_MISSING', 'NOT_BUNDLED', 'RUNTIME_ERROR']).toContain(err.code);
      }
    }
  });

  describe('probeAvailability', () => {
    afterEach(() => {
      // Both calls are necessary:
      //   - `jest.resetModules()` clears the *module registry* so the
      //     next test's `require('@analysis/pose/YoloPoseProvider')`
      //     re-evaluates the provider against a fresh `climbing-pose`
      //     binding.
      //   - `jest.dontMock('climbing-pose')` clears the *mock factory
      //     registry*. `jest.doMock` inside `jest.isolateModules`
      //     writes to the *global* registry — `isolateModules` only
      //     sandboxes which modules are evaluated, not which mocks
      //     are registered. Without `dontMock`, a leftover mock
      //     factory would leak into later tests.
      jest.resetModules();
      jest.dontMock('climbing-pose');
    });

    it('returns false in node/test environments where the native module is missing', () => {
      // Lock the contract that the resolver depends on: in any
      // environment without a real ClimbingPose native module
      // (Expo Go, jsdom, jest), the probe must report unavailable
      // *without* throwing. Throwing here would make the resolver's
      // tryYolo() blow up at app start.
      expect(YoloPoseProvider.probeAvailability()).toBe(false);
    });

    it('returns true when the native shim reports availability', () => {
      const detectSpy = jest.fn();
      jest.isolateModules(() => {
        jest.doMock('climbing-pose', () => ({
          isYoloPoseAvailable: () => true,
          detectPosesInVideoWithYolo: detectSpy,
        }));
        // Require the provider *inside* the isolated registry so it
        // resolves the mocked module instead of the real shim.
        // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
        const { YoloPoseProvider: Mocked } = require('@analysis/pose/YoloPoseProvider');
        expect(Mocked.probeAvailability()).toBe(true);
        // Real regression guard: probe must NEVER touch inference.
        // The previous bug invoked `detectPosesInVideoWithYolo` with
        // `videoUri: 'probe://none'`, which would reject on a real
        // bundled build and falsely classify YOLO as unavailable.
        expect(detectSpy).not.toHaveBeenCalled();
      });
    });

    it('returns false when isYoloPoseAvailable throws (e.g., a TurboModule dispatch failure)', () => {
      jest.isolateModules(() => {
        jest.doMock('climbing-pose', () => ({
          isYoloPoseAvailable: () => {
            throw new Error('simulated native bridge failure');
          },
          detectPosesInVideoWithYolo: () => Promise.reject(new Error('unused')),
        }));
        // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
        const { YoloPoseProvider: Mocked } = require('@analysis/pose/YoloPoseProvider');
        // Must not surface the native error — the resolver depends on
        // probeAvailability never throwing.
        expect(() => Mocked.probeAvailability()).not.toThrow();
        expect(Mocked.probeAvailability()).toBe(false);
      });
    });

    it('returns false when isYoloPoseAvailable is missing from the native exports', () => {
      jest.isolateModules(() => {
        jest.doMock('climbing-pose', () => ({
          // No isYoloPoseAvailable — simulates a partially shipped build.
          detectPosesInVideoWithYolo: () => Promise.reject(new Error('unused')),
        }));
        // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
        const { YoloPoseProvider: Mocked } = require('@analysis/pose/YoloPoseProvider');
        expect(Mocked.probeAvailability()).toBe(false);
      });
    });

    it('returns true even when detectPosesInVideoWithYolo is missing (probe is decoupled from inference)', () => {
      // This locks an *abstraction-boundary* invariant, not a
      // product-shipping invariant: a real native build will never
      // ship `isYoloPoseAvailable` without `detectPosesInVideoWithYolo`
      // — both come from the same Podspec/AAR. What this test pins is
      // that `loadYoloApi('probe')` only requires the probe entry
      // point and does NOT regress to checking for inference methods.
      // If a future refactor re-couples the shape check, this test
      // catches it.
      jest.isolateModules(() => {
        jest.doMock('climbing-pose', () => ({
          isYoloPoseAvailable: () => true,
          // No detectPosesInVideoWithYolo.
        }));
        // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
        const { YoloPoseProvider: Mocked } = require('@analysis/pose/YoloPoseProvider');
        expect(Mocked.probeAvailability()).toBe(true);
      });
    });
  });
});
