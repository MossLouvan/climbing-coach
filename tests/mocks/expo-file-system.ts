export class File {
  constructor(..._uris: unknown[]) {}
  async arrayBuffer(): Promise<ArrayBuffer> {
    return new ArrayBuffer(0);
  }
}
