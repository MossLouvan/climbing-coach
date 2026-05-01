import { detectClimbingWall } from '@analysis/wallDetector';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

const fakeFrame = {
  bytes: new Uint8Array([1, 2, 3]),
  contentType: 'image/jpeg' as const,
  uri: 'file://frame.jpg',
  widthPx: 100,
  heightPx: 200,
};

function makeFetch(body: unknown, ok = true, status = 200): typeof fetch {
  return jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response) as unknown as typeof fetch;
}

describe('detectClimbingWall', () => {
  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_HF_API_KEY;
    delete process.env.EXPO_PUBLIC_HF_CAPTION_MODEL;
  });

  it('returns disabled with no_api_key when key is missing', async () => {
    const result = await detectClimbingWall({ videoUri: 'file://v.mov' });
    expect(result).toEqual({ outcome: 'disabled', reason: 'no_api_key' });
  });

  it('returns ok for a positive caption', async () => {
    const result = await detectClimbingWall({
      videoUri: 'file://v.mov',
      apiKey: 'hf_key',
      extractFrame: async () => fakeFrame,
      fetchImpl: makeFetch([{ generated_text: 'a person rock climbing on a wall' }]),
    });
    expect(result.outcome).toBe('ok');
    if (result.outcome === 'ok') {
      expect(result.caption).toBe('a person rock climbing on a wall');
      expect(result.verdict.isClimbingWall).toBe(true);
    }
  });

  it('returns skip when caption has no climbing signal', async () => {
    const result = await detectClimbingWall({
      videoUri: 'file://v.mov',
      apiKey: 'hf_key',
      extractFrame: async () => fakeFrame,
      fetchImpl: makeFetch([{ generated_text: 'a kitchen with a fridge' }]),
    });
    expect(result.outcome).toBe('skip');
    if (result.outcome === 'skip') {
      expect(result.reason).toBe('no_climbing_wall_detected');
      expect(result.caption).toBe('a kitchen with a fridge');
    }
  });

  it('returns disabled on extraction failure (fail open)', async () => {
    const result = await detectClimbingWall({
      videoUri: 'file://v.mov',
      apiKey: 'hf_key',
      extractFrame: async () => {
        throw new Error('decoder unavailable');
      },
      fetchImpl: makeFetch({}),
    });
    expect(result.outcome).toBe('disabled');
    if (result.outcome === 'disabled') {
      expect(result.reason).toBe('extraction_failed');
    }
  });

  it('returns disabled on inference failure (fail open)', async () => {
    const result = await detectClimbingWall({
      videoUri: 'file://v.mov',
      apiKey: 'hf_key',
      extractFrame: async () => fakeFrame,
      fetchImpl: makeFetch('model loading', false, 503),
    });
    expect(result.outcome).toBe('disabled');
    if (result.outcome === 'disabled') {
      expect(result.reason).toBe('inference_failed');
    }
  });

  it('returns disabled on empty caption', async () => {
    const result = await detectClimbingWall({
      videoUri: 'file://v.mov',
      apiKey: 'hf_key',
      extractFrame: async () => fakeFrame,
      fetchImpl: makeFetch([{ generated_text: '' }]),
    });
    expect(result.outcome).toBe('disabled');
    if (result.outcome === 'disabled') {
      expect(result.reason).toBe('empty_caption');
    }
  });
});
