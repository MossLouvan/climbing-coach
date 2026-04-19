import type {
  PoseInferenceProgress,
  PoseInferenceRequest,
  PoseInferenceResult,
  PoseProvider,
} from './PoseProvider';

/**
 * Real pose inference via `@tensorflow/tfjs-react-native` + MoveNet.
 *
 * THIS PROVIDER REQUIRES A CUSTOM EXPO DEV BUILD.
 * ------------------------------------------------
 * Running it inside Expo Go will throw `Error.NEEDS_DEV_BUILD`.
 *
 * Setup (documented in `docs/ARCHITECTURE.md#pose-inference`):
 *   npx expo prebuild --platform ios
 *   npm install @tensorflow/tfjs @tensorflow/tfjs-react-native \
 *               @tensorflow-models/pose-detection \
 *               react-native-fs expo-gl
 *   npx expo run:ios
 *
 * We keep this file as a STUB that declares the provider interface but
 * throws at runtime unless the native deps are available. This way:
 *   - the app type-checks in Expo Go,
 *   - the provider registry can advertise this option and gracefully
 *     fall back to the mock provider with a clear message,
 *   - and porting this file to a real TFJS impl is a localized change
 *     (no other file depends on tfjs symbols).
 */
export class TFJSProviderUnavailableError extends Error {
  public readonly code: 'NEEDS_DEV_BUILD' | 'DEPS_MISSING';
  constructor(code: 'NEEDS_DEV_BUILD' | 'DEPS_MISSING', message: string) {
    super(message);
    this.code = code;
    this.name = 'TFJSProviderUnavailableError';
  }
}

export class TFJSPoseProvider implements PoseProvider {
  public readonly name = 'tfjs-movenet-lightning';
  public readonly isRealInference = true;

  async infer(
    _request: PoseInferenceRequest,
    _onProgress?: (p: PoseInferenceProgress) => void,
  ): Promise<PoseInferenceResult> {
    throw new TFJSProviderUnavailableError(
      'NEEDS_DEV_BUILD',
      'TFJSPoseProvider requires a custom Expo dev build with tfjs-react-native. ' +
        'See docs/ARCHITECTURE.md → "Pose inference" for setup. ' +
        'Falling back to the seeded MockPoseProvider is handled automatically.',
    );
  }
}
