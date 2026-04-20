import { File } from 'expo-file-system';
import { getThumbnailAsync } from 'expo-video-thumbnails';

/**
 * Extracts the first frame of a video as JPEG bytes + the on-disk URI.
 *
 * Implemented on top of `expo-video-thumbnails`, which is already a
 * project dependency and works without a native rebuild. The frame is
 * grabbed at t=0 (override via `opts.timeMs` when the decoder returns a
 * blank frame at 0ms) and its bytes are read via the SDK 54 `File`
 * API as an ArrayBuffer, then wrapped as a `Uint8Array` for upload to
 * the Hugging Face inference endpoint.
 */
export interface FirstFrameResult {
  readonly bytes: Uint8Array;
  readonly contentType: 'image/jpeg';
  readonly uri: string;
  readonly widthPx: number;
  readonly heightPx: number;
}

export async function extractFirstFrame(
  videoUri: string,
  opts?: { timeMs?: number; quality?: number },
): Promise<FirstFrameResult> {
  const { uri, width, height } = await getThumbnailAsync(videoUri, {
    time: opts?.timeMs ?? 0,
    quality: opts?.quality ?? 0.7,
  });

  const buffer = await new File(uri).arrayBuffer();

  return {
    bytes: new Uint8Array(buffer),
    contentType: 'image/jpeg',
    uri,
    widthPx: width,
    heightPx: height,
  };
}
