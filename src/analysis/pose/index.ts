import { MockPoseProvider } from './MockPoseProvider';
import type { PoseProvider } from './PoseProvider';
import { TFJSPoseProvider, TFJSProviderUnavailableError } from './TFJSPoseProvider';

export * from './PoseProvider';
export { MockPoseProvider } from './MockPoseProvider';
export { TFJSPoseProvider, TFJSProviderUnavailableError } from './TFJSPoseProvider';

/**
 * Resolve the best available pose provider at runtime.
 *
 *  - If a real TFJS provider is wired up and its native deps load,
 *    use it.
 *  - Otherwise fall back to the MockPoseProvider, clearly flagged.
 *
 * Callers should treat `result.isRealInference === false` as a hint
 * to badge the session as a demo.
 */
export async function resolvePoseProvider(
  preferReal: boolean,
): Promise<PoseProvider> {
  if (preferReal) {
    const real = new TFJSPoseProvider();
    try {
      // Probe by calling infer() with a synthetic 0-frame request.
      await real.infer({
        videoUri: 'probe://none',
        widthPx: 1,
        heightPx: 1,
        targetFps: 1,
        maxFrames: 0,
      });
      return real;
    } catch (err) {
      if (!(err instanceof TFJSProviderUnavailableError)) throw err;
      // fall through to mock
    }
  }
  return new MockPoseProvider();
}
