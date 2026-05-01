import { readAppEnv, type PoseBackend } from '@config/env';

import { MockPoseProvider } from './MockPoseProvider';
import type { PoseProvider } from './PoseProvider';
import { TFJSPoseProvider, TFJSProviderUnavailableError } from './TFJSPoseProvider';
import {
  VisionPoseProvider,
  VisionProviderUnavailableError,
} from './VisionPoseProvider';
import { YoloPoseProvider } from './YoloPoseProvider';

export * from './PoseProvider';
export { MockPoseProvider } from './MockPoseProvider';
export { TFJSPoseProvider, TFJSProviderUnavailableError } from './TFJSPoseProvider';
export { VisionPoseProvider, VisionProviderUnavailableError } from './VisionPoseProvider';
export { YoloPoseProvider, YoloProviderUnavailableError } from './YoloPoseProvider';

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

function readBackend(): PoseBackend {
  try {
    return readAppEnv().analysisPoseBackend;
  } catch {
    // readAppEnv touches expo-constants; fall back to 'auto' in node tests.
    return 'auto';
  }
}

async function tryYolo(): Promise<PoseProvider | null> {
  // Invariant: `probeAvailability()` is synchronous, side-effect-
  // -bounded to a single native availability query, and never throws.
  // This function must never run YOLO inference — doing so on a
  // fully-bundled build with a fake URI was the previous bug (the
  // native call rejected on the bogus path and we mis-reported YOLO
  // as unavailable). Keep this body trivial.
  if (!YoloPoseProvider.probeAvailability()) return null;
  return new YoloPoseProvider();
}

async function tryVision(): Promise<PoseProvider | null> {
  if (currentOs() !== 'ios') return null;
  try {
    return new VisionPoseProvider();
  } catch (err) {
    if (err instanceof VisionProviderUnavailableError) return null;
    throw err;
  }
}

async function tryTfjs(): Promise<PoseProvider | null> {
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
    if (err instanceof TFJSProviderUnavailableError) return null;
    throw err;
  }
}

/**
 * Resolve the best available pose provider at runtime.
 *
 * Backend policy (from `EXPO_PUBLIC_ANALYSIS_POSE_BACKEND` / extra):
 *   - 'yolo':   YOLO only, else mock (explicit opt-in, used for dogfood).
 *   - 'vision': Vision only on iOS, else mock (legacy fallback).
 *   - 'auto'  : YOLO → Vision(iOS) → TFJS → Mock. Default.
 *
 * Callers should treat `result.isRealInference === false` as a hint
 * to badge the session as a demo.
 */
export async function resolvePoseProvider(
  preferReal: boolean,
  overrideBackend?: PoseBackend,
): Promise<PoseProvider> {
  if (!preferReal) return new MockPoseProvider();

  const backend = overrideBackend ?? readBackend();

  if (backend === 'yolo') {
    const y = await tryYolo();
    if (y) return y;
    return new MockPoseProvider();
  }

  if (backend === 'vision') {
    const v = await tryVision();
    if (v) return v;
    return new MockPoseProvider();
  }

  // 'auto' — honor the full priority chain.
  const y = await tryYolo();
  if (y) return y;

  const v = await tryVision();
  if (v) return v;

  const t = await tryTfjs();
  if (t) return t;

  return new MockPoseProvider();
}
