import { describe, expect, it } from "vitest";
import { readAtLeast, withStart } from "./byte-stream";

/** A stream of these chunks, which says whether it was cancelled. */
function streamOf(...chunks: number[][]) {
  const state = { pulled: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[state.pulled];
      state.pulled += 1;
      if (chunk === undefined) controller.close();
      else controller.enqueue(new Uint8Array(chunk));
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { stream, state };
}

async function all(stream: ReadableStream<Uint8Array>): Promise<number[]> {
  const out: number[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(...value);
  }
}

describe("readAtLeast", () => {
  it("reads whole chunks until it has enough, and no further", async () => {
    const { stream, state } = streamOf([1, 2], [3, 4, 5], [6], [7]);
    const start = await readAtLeast(stream, 4);
    expect([...start.bytes]).toEqual([1, 2, 3, 4, 5]);
    expect(start.ended).toBe(false);
    expect(state.pulled).toBeLessThanOrEqual(3);
    await start.reader.cancel();
    expect(state.cancelled).toBe(true);
  });

  it("says when the stream ended first", async () => {
    const { stream } = streamOf([1], [], [2]);
    const start = await readAtLeast(stream, 10);
    expect([...start.bytes]).toEqual([1, 2]);
    expect(start.ended).toBe(true);
  });
});

describe("withStart", () => {
  it("gives the whole file back: what was read, then the rest", async () => {
    const { stream } = streamOf([1, 2], [3], [4, 5], [6]);
    const start = await readAtLeast(stream, 3);
    expect(await all(withStart(start))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("ends with what was read when the stream had ended", async () => {
    const { stream } = streamOf([1, 2]);
    const start = await readAtLeast(stream, 10);
    expect(await all(withStart(start))).toEqual([1, 2]);
    const empty = await readAtLeast(streamOf().stream, 10);
    expect(await all(withStart(empty))).toEqual([]);
  });

  it("stops the download when the browser goes away", async () => {
    const { stream, state } = streamOf([1, 2], [3], [4]);
    const start = await readAtLeast(stream, 1);
    await withStart(start).cancel();
    expect(state.cancelled).toBe(true);
  });
});
