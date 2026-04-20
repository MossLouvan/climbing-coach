export async function getThumbnailAsync(
  _uri: string,
  _opts?: unknown,
): Promise<{ uri: string; width: number; height: number }> {
  return { uri: 'file://stub-thumb.jpg', width: 100, height: 200 };
}
