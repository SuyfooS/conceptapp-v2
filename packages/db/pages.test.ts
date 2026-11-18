import { describe, expect, it } from "vitest";
import { allPages, PAGE_ROWS } from "./pages";

/** A read of `count` rows that serves at most PostgREST's 1000 per request. */
function rows(count: number) {
  const all = Array.from({ length: count }, (_, index) => index);
  const asked: [number, number][] = [];
  const page = async (first: number, last: number) => {
    asked.push([first, last]);
    const end = Math.min(last + 1, first + PAGE_ROWS);
    return { data: all.slice(first, end), error: null };
  };
  return { all, asked, page };
}

describe("reading page by page", () => {
  it("reads past PostgREST's 1000 rows, in order", async () => {
    const read = rows(2345);
    expect(await allPages(read.page)).toEqual(read.all);
    expect(read.asked).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("asks once more after a full page, and once for a short read", async () => {
    const full = rows(1000);
    expect(await allPages(full.page)).toHaveLength(1000);
    expect(full.asked).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    const short = rows(3);
    expect(await allPages(short.page)).toEqual([0, 1, 2]);
    expect(short.asked).toHaveLength(1);
  });

  it("throws a page's error", async () => {
    const failure = new Error("permission denied");
    await expect(
      allPages(async () => ({ data: null, error: failure })),
    ).rejects.toBe(failure);
  });
});
