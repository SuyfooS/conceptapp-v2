import { describe, expect, it } from "vitest";
import {
  checkListPhoto,
  DEFAULT_LIST_PHOTO_DAYS,
  fitWithin,
  isListPhotoFile,
  isListPhotoPath,
  LIST_PHOTO_DAYS,
  LIST_PHOTO_MAX_BYTES,
  LIST_PHOTO_PIXELS,
  LIST_PHOTO_STEPS,
  LIST_PHOTO_TARGET_BYTES,
  listPhotoPath,
  listPhotoSrc,
  listPhotoVerdict,
} from "./list-photos";

// Small files in the shapes the browser writes, built byte by byte as in
// profile-photos.test.ts: what the checks read is their headers.
const bytesOf = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === "string" ? [...part].map((c) => c.charCodeAt(0)) : part,
    ),
  );
const be16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];
const le16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
const le24 = (n: number) => [...le16(n), (n >>> 16) & 0xff];

const exif = [
  0xff,
  0xe1,
  0,
  16,
  ..."Exif\0\0MM\0*\0\0\0\b".split("").map((c) => c.charCodeAt(0)),
];
const frame = (width: number, height: number) => [
  0xff,
  0xc0,
  0,
  11,
  8,
  ...be16(height),
  ...be16(width),
  1,
  1,
  0x11,
  0,
];
const scan = [0xff, 0xda, 0, 4, 0, 0, 0x12, 0x34, 0xff, 0xd9];
const jpegOf = (width: number, height: number, ...before: number[][]) =>
  bytesOf([0xff, 0xd8], ...before, frame(width, height), scan);

const webpChunk = (type: string, data: number[]) => [
  ...[...type].map((c) => c.charCodeAt(0)),
  data.length,
  0,
  0,
  0,
  ...data,
  ...(data.length % 2 ? [0] : []),
];
const vp8 = (width: number, height: number) =>
  webpChunk("VP8 ", [
    0x50,
    0x02,
    0x00,
    0x9d,
    0x01,
    0x2a,
    ...le16(width),
    ...le16(height),
    0,
    0,
  ]);
const vp8x = (flags: number, width: number, height: number) =>
  webpChunk("VP8X", [flags, 0, 0, 0, ...le24(width - 1), ...le24(height - 1)]);
const webpOf = (...chunks: number[][]) =>
  bytesOf("RIFF", [0x24, 0, 0, 0], "WEBP", ...chunks);
const pngOf = () =>
  bytesOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 13]);

const check = (bytes: Uint8Array, type: string, size = bytes.length) =>
  checkListPhoto({ type, size, bytes });

describe("checkListPhoto", () => {
  it("takes the browser's WebP or JPEG, its longest side up to 1280 px, any shape", () => {
    expect(check(webpOf(vp8(1280, 960)), "image/webp")).toEqual({
      ok: true,
      type: "image/webp",
      extension: "webp",
    });
    expect(check(jpegOf(960, 1280), "image/jpeg")).toEqual({
      ok: true,
      type: "image/jpeg",
      extension: "jpg",
    });
    expect(check(jpegOf(1, 1), "image/jpeg").ok).toBe(true);
  });

  it("refuses a PNG, which the browser never sends for a list", () => {
    expect(check(pngOf(), "image/png")).toEqual({
      ok: false,
      problem: "type",
    });
  });

  it("refuses bytes that aren't what the browser said they are", () => {
    expect(check(jpegOf(800, 600), "image/webp")).toEqual({
      ok: false,
      problem: "type",
    });
    expect(check(bytesOf("GIF89a"), "image/gif")).toEqual({
      ok: false,
      problem: "type",
    });
  });

  it("refuses an empty file and one over 400 KB", () => {
    expect(check(new Uint8Array(), "image/jpeg")).toEqual({
      ok: false,
      problem: "empty",
    });
    expect(
      check(jpegOf(800, 600), "image/jpeg", LIST_PHOTO_MAX_BYTES + 1),
    ).toEqual({ ok: false, problem: "tooBig" });
    expect(LIST_PHOTO_MAX_BYTES).toBe(400 * 1024);
  });

  it("refuses a file that still carries what the camera wrote", () => {
    expect(check(jpegOf(800, 600, exif), "image/jpeg")).toEqual({
      ok: false,
      problem: "metadata",
    });
    expect(
      check(
        webpOf(vp8x(0x08, 800, 600), vp8(800, 600), webpChunk("EXIF", [1, 2])),
        "image/webp",
      ),
    ).toEqual({ ok: false, problem: "metadata" });
  });

  it("refuses a picture larger than the app stores, or one that moves", () => {
    expect(check(jpegOf(LIST_PHOTO_PIXELS + 1, 600), "image/jpeg")).toEqual({
      ok: false,
      problem: "pixels",
    });
    expect(check(webpOf(vp8(600, 1500)), "image/webp")).toEqual({
      ok: false,
      problem: "pixels",
    });
    expect(
      check(webpOf(vp8x(0x02, 800, 600), vp8(800, 600)), "image/webp"),
    ).toEqual({ ok: false, problem: "pixels" });
    expect(check(bytesOf([0xff, 0xd8], scan), "image/jpeg")).toEqual({
      ok: false,
      problem: "pixels",
    });
  });
});

describe("encoding a list's photo", () => {
  it("draws the longest side at 1280 px at most, keeping the shape", () => {
    expect(fitWithin(4032, 3024, 1280)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(3024, 4032, 1280)).toEqual({ width: 960, height: 1280 });
    expect(fitWithin(4000, 1000, 1024)).toEqual({ width: 1024, height: 256 });
  });

  it("never draws a picture larger than it is, nor narrower than a pixel", () => {
    expect(fitWithin(640, 480, 1280)).toEqual({ width: 640, height: 480 });
    expect(fitWithin(10000, 2, 1280)).toEqual({ width: 1280, height: 1 });
    expect(fitWithin(0, 480, 1280)).toEqual({ width: 0, height: 0 });
  });

  it("steps down from 1280 px at 0.72, smaller each time", () => {
    expect(LIST_PHOTO_STEPS[0]).toEqual({ pixels: 1280, quality: 0.72 });
    for (let at = 1; at < LIST_PHOTO_STEPS.length; at += 1) {
      const step = LIST_PHOTO_STEPS[at];
      const before = LIST_PHOTO_STEPS[at - 1];
      if (!step || !before) throw new Error("A step is missing");
      expect(step.pixels).toBeLessThanOrEqual(before.pixels);
      expect(step.pixels * step.quality).toBeLessThan(
        before.pixels * before.quality,
      );
    }
  });

  it("keeps the first encoding at about 0.3 MB, and tries the next until then", () => {
    expect(listPhotoVerdict([180_000])).toEqual({ keep: 0 });
    expect(listPhotoVerdict([LIST_PHOTO_TARGET_BYTES])).toEqual({ keep: 0 });
    expect(listPhotoVerdict([LIST_PHOTO_TARGET_BYTES + 1])).toBe("next");
    expect(listPhotoVerdict([500_000, 290_000])).toEqual({ keep: 1 });
    expect(listPhotoVerdict([])).toBe("next");
  });

  it("at the end keeps the smallest the server takes, or says it is too big", () => {
    const over = LIST_PHOTO_STEPS.map((_, at) => 500_000 - at * 20_000);
    expect(listPhotoVerdict(over)).toBe("tooBig");
    const last = LIST_PHOTO_STEPS.map((_, at) =>
      at === 1 ? 350_000 : 390_000,
    );
    expect(listPhotoVerdict(last)).toEqual({ keep: 1 });
  });
});

describe("a list photo's place", () => {
  const business = "0b5c3a2e-8f1d-4c6a-9e7b-1a2b3c4d5e6f";
  const list = "7e9d1c3b-5a4f-4e2d-8c1b-9a8b7c6d5e4f";

  it("is in its list's folder of its business", () => {
    const path = listPhotoPath(business, list, "a1b2c3", "webp");
    expect(path).toBe(`${business}/${list}/a1b2c3.webp`);
    expect(isListPhotoPath(path)).toBe(true);
    expect(isListPhotoPath(path, { businessId: business, listId: list })).toBe(
      true,
    );
  });

  it("is refused in another list or business, or as anything else", () => {
    const path = listPhotoPath(business, list, "a1b2c3", "jpg");
    expect(isListPhotoPath(path, { businessId: list, listId: list })).toBe(
      false,
    );
    expect(
      isListPhotoPath(path, { businessId: business, listId: business }),
    ).toBe(false);
    for (const bad of [
      `${business}/${list}/A1.webp`,
      `${business}/${list}/a1.png`,
      `${business}/${list}/../a1.webp`,
      `${business}/${list}/a1.webp/x`,
      `${business}/a1.webp`,
      `../${list}/a1.webp`,
      `${business}/${list}/${"a".repeat(41)}.jpg`,
    ]) {
      expect(isListPhotoPath(bad), bad).toBe(false);
    }
  });

  it("names its file with a key and a type", () => {
    expect(isListPhotoFile("0123abcd.webp")).toBe(true);
    expect(isListPhotoFile("0123abcd.jpeg")).toBe(false);
    expect(isListPhotoFile(".webp")).toBe(false);
  });

  it("is shown through the app's own route", () => {
    expect(listPhotoSrc(`${business}/${list}/a1.webp`)).toBe(
      `/list-photos/${business}/${list}/a1.webp`,
    );
    expect(listPhotoSrc(null)).toBeNull();
  });

  it("is kept 90 days unless the team chose another", () => {
    expect(DEFAULT_LIST_PHOTO_DAYS).toBe(90);
    expect(LIST_PHOTO_DAYS).toContain(DEFAULT_LIST_PHOTO_DAYS);
  });
});
