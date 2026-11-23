import { describe, expect, it } from "vitest";
import {
  allPages,
  allPagesIn,
  IDS_PER_READ,
  inParts,
  PAGE_ROWS,
  readAllPages,
  readAllPagesIn,
} from "./pages";

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

describe("ids in parts", () => {
  it("cuts a list into parts of at most 100, in order", () => {
    const ids = (count: number) =>
      Array.from({ length: count }, (_, index) => index);
    expect(inParts(ids(0))).toEqual([]);
    expect(inParts(ids(1))).toEqual([[0]]);
    expect(inParts(ids(100)).map((part) => part.length)).toEqual([100]);
    expect(inParts(ids(101)).map((part) => part.length)).toEqual([100, 1]);
    const parts = inParts(ids(250));
    expect(parts.map((part) => part.length)).toEqual([100, 100, 50]);
    expect(parts.flat()).toEqual(ids(250));
    expect(IDS_PER_READ).toBe(100);
  });
});

describe("reading page by page, answering as one read does", () => {
  it("reads past 1000 rows and answers with no error", async () => {
    const read = rows(2345);
    expect(await readAllPages(read.page)).toEqual({
      data: read.all,
      error: null,
    });
    expect(read.asked).toHaveLength(3);
  });

  it("answers a page's error without throwing, and asks no more", async () => {
    const failure = { code: "42P01", message: "no such table" };
    let asked = 0;
    const answer = await readAllPages(async (first) => {
      asked += 1;
      return first === 0
        ? { data: Array.from({ length: PAGE_ROWS }, () => 1), error: null }
        : { data: null, error: failure };
    });
    expect(answer).toEqual({ data: null, error: failure });
    expect(asked).toBe(2);
  });
});

describe("reading ids in parts, each page by page", () => {
  /** Rows of `ids`, `perId` each, served at most 1000 a request. */
  function byIds(perId: (id: number) => number) {
    const asked: { part: number[]; first: number; last: number }[] = [];
    const page = async (part: number[], first: number, last: number) => {
      asked.push({ part, first, last });
      const all = part.flatMap((id) =>
        Array.from({ length: perId(id) }, (_, index) => `${id}:${index}`),
      );
      const end = Math.min(last + 1, first + PAGE_ROWS);
      return { data: all.slice(first, end), error: null };
    };
    return { asked, page };
  }

  it("asks nothing for none", async () => {
    const read = byIds(() => 1);
    expect(await allPagesIn([], read.page)).toEqual([]);
    expect(read.asked).toEqual([]);
  });

  it("reads 250 ids in three parts, a part past 1000 rows in two pages, in order", async () => {
    const ids = Array.from({ length: 250 }, (_, index) => index);
    // The first part's ids hold 12 rows each: 1200 rows in that part.
    const read = byIds((id) => (id < 100 ? 12 : 1));
    const got = await allPagesIn(ids, read.page);
    expect(got).toHaveLength(1200 + 150);
    expect(got.slice(0, 12)).toEqual(
      Array.from({ length: 12 }, (_, index) => `0:${index}`),
    );
    expect(got.at(-1)).toBe("249:0");
    expect(read.asked.every((ask) => ask.part.length <= IDS_PER_READ)).toBe(
      true,
    );
    expect(
      read.asked
        .map((ask) => [ask.part[0] ?? -1, ask.first])
        .sort(([a = 0, x = 0], [b = 0, y = 0]) => a - b || x - y),
    ).toEqual([
      [0, 0],
      [0, 1000],
      [100, 0],
      [200, 0],
    ]);
  });

  it("throws a part's error, or answers it as one read does", async () => {
    const failure = new Error("permission denied");
    const failing = async () => ({ data: null, error: failure });
    await expect(allPagesIn([1, 2], failing)).rejects.toBe(failure);
    expect(await readAllPagesIn([1, 2], failing)).toEqual({
      data: null,
      error: failure,
    });
  });
});
