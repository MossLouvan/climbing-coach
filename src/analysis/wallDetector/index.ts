import { readAppEnv } from '@config/env';

import { extractFirstFrame } from './firstFrame';
import { captionImage, HfApiError } from './huggingface';
import { evaluateCaption, type KeywordVerdict } from './keywords';

/**
 * Wall detection is the first stage of `analyzeSession`. It pulls the
 * first frame of the video, asks a Hugging Face image-to-text model
 * to describe it, and checks the caption for climbing-wall vocabulary.
 *
 * Three outcomes:
 *   - ok         — caption mentions a climbing wall / bouldering / rock face.
 *                  The pipeline proceeds to pose inference.
 *   - skip       — caption has no climbing signal (or has strong negatives).
 *                  The pipeline refuses to analyze and surfaces the reason.
 *   - disabled   — no HF API key configured, or the call failed.
 *                  We fail OPEN so analysis still runs; the UI can badge
 *                  the result as "wall check skipped".
 *
 * The decision is deliberately cheap: one first-frame inference, no
 * per-frame polling. The goal is to reject obviously-wrong inputs, not
 * to classify climbing style.
 */
export type WallDetectionOutcome =
  | {
      readonly outcome: 'ok';
      readonly caption: string;
      readonly verdict: KeywordVerdict;
    }
  | {
      readonly outcome: 'skip';
      readonly reason: 'no_climbing_wall_detected';
      readonly caption: string;
      readonly verdict: KeywordVerdict;
    }
  | {
      readonly outcome: 'disabled';
      readonly reason:
        | 'no_api_key'
        | 'extraction_failed'
        | 'inference_failed'
        | 'empty_caption';
      readonly detail?: string;
    };

export interface DetectWallArgs {
  readonly videoUri: string;
  readonly apiKey?: string;
  readonly model?: string;
  readonly fetchImpl?: typeof fetch;
  readonly extractFrame?: typeof extractFirstFrame;
}

export async function detectClimbingWall(
  args: DetectWallArgs,
): Promise<WallDetectionOutcome> {
  const env = readAppEnv();
  const apiKey = args.apiKey ?? env.hfApiKey;
  if (!apiKey) {
    return { outcome: 'disabled', reason: 'no_api_key' };
  }

  let frame;
  try {
    frame = await (args.extractFrame ?? extractFirstFrame)(args.videoUri);
  } catch (err) {
    return {
      outcome: 'disabled',
      reason: 'extraction_failed',
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  let caption: string;
  try {
    const result = await captionImage(
      {
        apiKey,
        model: args.model ?? env.hfCaptionModel,
        imageBytes: frame.bytes,
        contentType: frame.contentType,
      },
      args.fetchImpl,
    );
    caption = result.caption;
  } catch (err) {
    const detail =
      err instanceof HfApiError
        ? `HTTP ${err.status}: ${err.body}`
        : err instanceof Error
          ? err.message
          : String(err);
    return { outcome: 'disabled', reason: 'inference_failed', detail };
  }

  if (!caption) {
    return { outcome: 'disabled', reason: 'empty_caption' };
  }

  const verdict = evaluateCaption(caption);
  if (verdict.isClimbingWall) {
    return { outcome: 'ok', caption, verdict };
  }
  return {
    outcome: 'skip',
    reason: 'no_climbing_wall_detected',
    caption,
    verdict,
  };
}

export { evaluateCaption } from './keywords';
export type { KeywordVerdict } from './keywords';
export { captionImage, HfApiError, extractCaption } from './huggingface';
export { extractFirstFrame } from './firstFrame';
