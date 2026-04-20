import { MockPoseProvider } from './MockPoseProvider';
import type { PoseProvider } from './PoseProvider';
import { TFJSPoseProvider, TFJSProviderUnavailableError } from './TFJSPoseProvider';
import {
  VisionPoseProvider,
  VisionProviderUnavailableError,
} from './VisionPoseProvider';

export * from './PoseProvider';
export { MockPoseProvider } from './MockPoseProvider';
export { TFJSPoseProvider, TFJSProviderUnavailableError } from './TFJSPoseProvider';
export { VisionPoseProvider, VisionProviderUnavailableError } from './VisionPoseProvider';

/**
 * Detect the current platform without statically importing
 * `react-native`. Jest (node) can't parse react-native's Flow-typed
 * entry point, and this resolver is imported transitively by many
 * tests. Reading `Platform.OS` via a dynamic require keeps the file
 * test-safe while still giving the app the real value at runtime.
 */
function currentOs(): 'ios' | 'android' | 'web' | 'unknown' {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    const rn = require('react-native') as { Platform?: { OS?: string } };
    const os = rn?.Platform?.OS;
    if (os === 'ios' || os === 'android' || os === 'web') return os;
  } catch {
    // react-native not loadable (node/test env) — fall through
  }
  return 'unknown';
}

/**
 * Resolve the best available pose provider at runtime.
 *
 *   1. iOS with a prebuilt binary → Apple Vision (VisionPoseProvider).
 *   2. Any platform with a working TFJS stack → TFJSPoseProvider.
 *   3. Otherwise → MockPoseProvider, clearly flagged.
 *
 * Callers should treat `result.isRealInference === false` as a hint
 * to badge the session as a demo.
 */
export async function resolvePoseProvider(
  preferReal: boolean,
): Promise<PoseProvider> {
  if (!preferReal) return new MockPoseProvider();

  if (currentOs() === 'ios') {
    try {
      return new VisionPoseProvider();
    } catch (err) {
      if (!(err instanceof VisionProviderUnavailableError)) throw err;
    }
  }

  const tfjs = new TFJSPoseProvider();
  try {
    await tfjs.infer({
      videoUri: 'probe://none',
      widthPx: 1,
      heightPx: 1,
      targetFps: 1,
      maxFrames: 0,
    });
    return tfjs;
  } catch (err) {
    if (!(err instanceof TFJSProviderUnavailableError)) throw err;
  }

  return new MockPoseProvider();
}
