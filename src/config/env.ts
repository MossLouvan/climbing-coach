import Constants from 'expo-constants';

/**
 * Runtime configuration read from Expo `extra` and `EXPO_PUBLIC_*`
 * environment variables. Centralized so screens/services never reach
 * into `process.env` directly.
 *
 * ┌────────────────────────────────────────────────────────────────┐
 * │  HOW TO SET THE HUGGING FACE API KEY                           │
 * │                                                                │
 * │  Option 1 — shell env (local dev):                             │
 * │    export EXPO_PUBLIC_HF_API_KEY=hf_xxxxxxxxxxxxxxxxxxxxxxxx   │
 * │    npm run ios                                                 │
 * │                                                                │
 * │  Option 2 — .env at repo root (gitignored):                    │
 * │    EXPO_PUBLIC_HF_API_KEY=hf_xxxxxxxxxxxxxxxxxxxxxxxx          │
 * │                                                                │
 * │  Option 3 — EAS secret for release builds:                     │
 * │    eas secret:create --name EXPO_PUBLIC_HF_API_KEY --value ... │
 * │                                                                │
 * │  The `EXPO_PUBLIC_` prefix is REQUIRED — Expo only inlines env │
 * │  vars with that prefix into the client bundle.                 │
 * │                                                                │
 * │  Get a key: https://huggingface.co/settings/tokens (read role) │
 * └────────────────────────────────────────────────────────────────┘
 */
/**
 * Which pose-inference backend the app should use.
 *
 *   - 'auto'   — prefer YOLO (if bundled), fall back to Vision (iOS)
 *                then TFJS, then the mock provider.
 *   - 'yolo'   — force the Ultralytics YOLO-Pose path; fall through
 *                to mock if weights aren't bundled. Used during
 *                dogfood / eval runs to isolate the new model.
 *   - 'vision' — legacy Apple Vision only; Android falls back to mock.
 *                Kept for one release as a safety fallback.
 */
export type PoseBackend = 'auto' | 'yolo' | 'vision';

const POSE_BACKENDS: ReadonlyArray<PoseBackend> = ['auto', 'yolo', 'vision'];

function coercePoseBackend(value: unknown): PoseBackend {
  return typeof value === 'string' && (POSE_BACKENDS as ReadonlyArray<string>).includes(value)
    ? (value as PoseBackend)
    : 'auto';
}

export interface AppEnv {
  readonly buildProfile: string;
  /** Hugging Face Inference API token (read-scope). Undefined disables wall detection. */
  readonly hfApiKey: string | undefined;
  /** Image-to-text model ID. Override via EXPO_PUBLIC_HF_CAPTION_MODEL. */
  readonly hfCaptionModel: string;
  /**
   * Pose-inference backend selection. Override via
   * `EXPO_PUBLIC_ANALYSIS_POSE_BACKEND=yolo|vision|auto`. Default 'auto'.
   */
  readonly analysisPoseBackend: PoseBackend;
}

function readExtra(key: string): string | undefined {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const value = extra[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function readAppEnv(): AppEnv {
  return {
    buildProfile: readExtra('buildProfile') ?? 'dev',
    hfApiKey:
      process.env.EXPO_PUBLIC_HF_API_KEY ?? readExtra('hfApiKey'),
    hfCaptionModel:
      process.env.EXPO_PUBLIC_HF_CAPTION_MODEL ??
      readExtra('hfCaptionModel') ??
      'Salesforce/blip-image-captioning-large',
    analysisPoseBackend: coercePoseBackend(
      process.env.EXPO_PUBLIC_ANALYSIS_POSE_BACKEND ??
        readExtra('analysisPoseBackend'),
    ),
  };
}
