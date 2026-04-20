import { captionImage, extractCaption, HfApiError } from '@analysis/wallDetector/huggingface';

describe('extractCaption', () => {
  it('pulls generated_text from array responses', () => {
    expect(
      extractCaption([{ generated_text: 'a climber on a wall' }]),
    ).toBe('a climber on a wall');
  });

  it('pulls generated_text from object responses', () => {
    expect(extractCaption({ generated_text: 'hello' })).toBe('hello');
  });

  it('falls back to caption field', () => {
    expect(extractCaption([{ caption: 'x' }])).toBe('x');
    expect(extractCaption({ caption: 'y' })).toBe('y');
  });

  it('returns empty string on unknown shapes', () => {
    expect(extractCaption(null)).toBe('');
    expect(extractCaption(42)).toBe('');
    expect(extractCaption({ unrelated: 'field' })).toBe('');
    expect(extractCaption([])).toBe('');
  });
});

describe('captionImage', () => {
  it('posts to the correct URL with bearer auth + content-type', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ generated_text: 'climbing wall' }],
    } as unknown as Response);

    const result = await captionImage(
      {
        apiKey: 'hf_test',
        model: 'Salesforce/blip-image-captioning-large',
        imageBytes: new Uint8Array([1, 2, 3]),
        contentType: 'image/jpeg',
      },
      fetchImpl as unknown as typeof fetch,
    );

    expect(result.caption).toBe('climbing wall');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      'https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large',
    );
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer hf_test');
    expect(init.headers['Content-Type']).toBe('image/jpeg');
  });

  it('throws HfApiError on non-ok responses', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'model loading',
    } as unknown as Response);

    await expect(
      captionImage(
        {
          apiKey: 'k',
          model: 'm',
          imageBytes: new Uint8Array(),
          contentType: 'image/jpeg',
        },
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toThrow(HfApiError);
  });
});
