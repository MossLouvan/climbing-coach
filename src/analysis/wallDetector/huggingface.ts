/**
 * Minimal Hugging Face Inference API client for image-to-text models.
 *
 * Docs: https://huggingface.co/docs/api-inference/tasks/image-to-text
 *
 * We intentionally use the public `fetch` with a binary body rather than
 * the `@huggingface/inference` SDK so the module works in React Native
 * without extra polyfills.
 */
export interface HfCaptionRequest {
  readonly apiKey: string;
  readonly model: string;
  readonly imageBytes: Uint8Array;
  readonly contentType: string;
  readonly timeoutMs?: number;
}

export interface HfCaptionResult {
  readonly caption: string;
  readonly rawResponse: unknown;
}

export class HfApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Hugging Face API error ${status}: ${body}`);
    this.name = 'HfApiError';
  }
}

const HF_INFERENCE_BASE = 'https://api-inference.huggingface.co/models';

export async function captionImage(
  req: HfCaptionRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<HfCaptionResult> {
  const url = `${HF_INFERENCE_BASE}/${encodeURI(req.model)}`;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    req.timeoutMs ?? 20_000,
  );

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${req.apiKey}`,
        'Content-Type': req.contentType,
        Accept: 'application/json',
      },
      body: req.imageBytes as unknown as BodyInit,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await safeText(response);
      throw new HfApiError(response.status, body);
    }

    const json: unknown = await response.json();
    const caption = extractCaption(json);
    return { caption, rawResponse: json };
  } finally {
    clearTimeout(timeout);
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '<unavailable>';
  }
}

/**
 * HF image-to-text endpoints typically return either:
 *   [{ generated_text: "a person climbing a wall" }]
 *   { generated_text: "..." }
 *   [{ caption: "..." }]
 * We normalize all of these to a single string.
 */
export function extractCaption(payload: unknown): string {
  if (Array.isArray(payload) && payload.length > 0) {
    const first = payload[0] as Record<string, unknown>;
    const generated = first?.generated_text;
    if (typeof generated === 'string') return generated;
    const caption = first?.caption;
    if (typeof caption === 'string') return caption;
  }
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    const generated = obj.generated_text;
    if (typeof generated === 'string') return generated;
    const caption = obj.caption;
    if (typeof caption === 'string') return caption;
  }
  return '';
}
