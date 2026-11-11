/**
 * Reading the start of a file as it streams in (chat's PDFs, C5): the server
 * looks at a PDF's first bytes before it sends or serves it, without holding
 * the whole file (up to 10 MiB) in memory, and serves the rest as it comes.
 * Web streams only, so the same code runs in Node and in tests.
 */

/** What came from a stream until enough of it had: the bytes, and the rest. */
export type StreamStart = {
  /** Everything read so far, in order: at least `wanted` bytes unless it ended first. */
  bytes: Uint8Array<ArrayBuffer>;
  /** The reader of what is left; cancel it when the rest isn't wanted. */
  reader: ReadableStreamDefaultReader<Uint8Array>;
  /** The stream ended within what was read. */
  ended: boolean;
};

/**
 * Reads `stream` until at least `wanted` bytes came or it ended. The bytes are
 * whole chunks, so there may be more than `wanted`: whoever passes the file
 * on sends them all before the rest (`withStart`).
 */
export async function readAtLeast(
  stream: ReadableStream<Uint8Array>,
  wanted: number,
): Promise<StreamStart> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let ended = false;
  while (length < wanted) {
    const { done, value } = await reader.read();
    if (done) {
      ended = true;
      break;
    }
    if (value.length === 0) continue;
    chunks.push(value);
    length += value.length;
  }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return { bytes, reader, ended };
}

/**
 * The whole file again, as one stream: the bytes `readAtLeast` read, then the
 * rest from its reader. Cancelling it (the browser went away) cancels the
 * reader, so the download from Storage stops too.
 */
export function withStart(start: StreamStart): ReadableStream<Uint8Array> {
  let sentStart = start.bytes.length === 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!sentStart) {
        sentStart = true;
        controller.enqueue(start.bytes);
        if (start.ended) controller.close();
        return;
      }
      if (start.ended) {
        controller.close();
        return;
      }
      const { done, value } = await start.reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      return start.reader.cancel(reason);
    },
  });
}
