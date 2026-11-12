import { CHAT_THUMB_MAX_BYTES } from "@domain/chat-files";
import { DOCUMENT_PHOTO_MAX_BYTES } from "@domain/documents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  encodeChatImage,
  encodeDocumentPhoto,
  PhotoReadError,
} from "./photo-encode";

/*
 * encodeChatImage against stand-ins for the browser's decoder and canvas:
 * what is checked is what it asks of them (one decode, upright; which sizes
 * and qualities it draws; which type it keeps) and what it keeps of what they
 * give back. The pictures' own pixels are the browser's.
 */

type Drawn = { type: string; quality: number; width: number; height: number };

/** How large each encoding comes out, by what was drawn. */
let sizeOf: (drawn: Drawn) => number;
/** Whether the canvas writes WebP; Safari's gives a PNG when asked. */
let writesWebp: boolean;
let drawings: Drawn[];
const decoded = vi.fn();
const closed = vi.fn();

class FakeCanvas {
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}
  getContext() {
    return {
      fillStyle: "",
      fillRect() {},
      drawImage() {},
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
    };
  }
  async convertToBlob({ type, quality }: { type: string; quality: number }) {
    const written = type === "image/webp" && !writesWebp ? "image/png" : type;
    const drawn = {
      type: written,
      quality,
      width: this.width,
      height: this.height,
    };
    drawings.push(drawn);
    return new Blob([new Uint8Array(sizeOf(drawn))], { type: written });
  }
}

/** A phone's photo: 4032 by 3024 px, a few MB. */
const photo = () =>
  new File([new Uint8Array(64)], "photo.jpg", { type: "image/jpeg" });

const longest = (d: Drawn) => Math.max(d.width, d.height);

beforeEach(() => {
  writesWebp = true;
  drawings = [];
  decoded.mockReset();
  closed.mockReset();
  // A full picture of about 250 KB, a thumbnail of about 20 KB.
  sizeOf = (d) => (longest(d) > 400 ? 250_000 : 20_000);
  vi.stubGlobal("createImageBitmap", async (file: Blob, options: unknown) => {
    decoded(file, options);
    return { width: 4032, height: 3024, close: closed };
  });
  vi.stubGlobal("OffscreenCanvas", FakeCanvas);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("encodeChatImage", () => {
  it("decodes once, upright, and draws the picture and its thumbnail of the same type", async () => {
    const files = await encodeChatImage(photo());
    expect(decoded).toHaveBeenCalledTimes(1);
    expect(decoded.mock.calls[0]?.[1]).toEqual({
      imageOrientation: "from-image",
    });
    expect(closed).toHaveBeenCalledTimes(1);
    expect(files.full.type).toBe("image/webp");
    expect(files.thumb.type).toBe("image/webp");
    expect(files.full.size).toBe(250_000);
    expect(files.thumb.size).toBe(20_000);
    // Its shape kept, its longest side 1280 px; the thumbnail 360 px at 0.6.
    expect({ width: files.width, height: files.height }).toEqual({
      width: 1280,
      height: 960,
    });
    expect(drawings).toEqual([
      { type: "image/webp", quality: 0.72, width: 1280, height: 960 },
      { type: "image/webp", quality: 0.6, width: 360, height: 270 },
    ]);
  });

  it("writes both as JPEG where the browser can't write WebP", async () => {
    writesWebp = false;
    const files = await encodeChatImage(photo());
    expect(files.full.type).toBe("image/jpeg");
    expect(files.thumb.type).toBe("image/jpeg");
    // The thumbnail is asked as JPEG alone: never a WebP beside a JPEG.
    expect(
      drawings.filter((d) => longest(d) <= 400).map((d) => d.type),
    ).toEqual(["image/jpeg"]);
  });

  it("draws the thumbnail smaller until it is at most 48 KB", async () => {
    sizeOf = (d) =>
      longest(d) > 400
        ? 250_000
        : longest(d) === 360
          ? CHAT_THUMB_MAX_BYTES + 1
          : 30_000;
    const files = await encodeChatImage(photo());
    expect(files.thumb.size).toBe(30_000);
    expect(
      drawings
        .filter((d) => longest(d) <= 400)
        .map((d) => [longest(d), d.quality]),
    ).toEqual([
      [360, 0.6],
      [360, 0.45],
      [280, 0.45],
    ]);
  });

  it("is too big when no thumbnail fits, and lets the picture go", async () => {
    sizeOf = (d) => (longest(d) > 400 ? 250_000 : CHAT_THUMB_MAX_BYTES + 1);
    await expect(encodeChatImage(photo())).rejects.toEqual(
      new PhotoReadError("tooBig"),
    );
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("is too big when even the smallest picture is over 400 KB", async () => {
    sizeOf = () => 500_000;
    await expect(encodeChatImage(photo())).rejects.toMatchObject({
      problem: "tooBig",
    });
  });

  it("refuses what isn't a picture before decoding it", async () => {
    const text = new File(["hello"], "notes.txt", { type: "text/plain" });
    await expect(encodeChatImage(text)).rejects.toMatchObject({
      problem: "type",
    });
    expect(decoded).not.toHaveBeenCalled();
  });
});

describe("encodeDocumentPhoto", () => {
  it("draws a page at 1600 px, once, upright, with nothing beside it", async () => {
    sizeOf = () => 420_000;
    const page = await encodeDocumentPhoto(photo());
    expect(decoded).toHaveBeenCalledTimes(1);
    expect(decoded.mock.calls[0]?.[1]).toEqual({
      imageOrientation: "from-image",
    });
    expect(closed).toHaveBeenCalledTimes(1);
    expect(page.blob.type).toBe("image/webp");
    expect({ width: page.width, height: page.height }).toEqual({
      width: 1600,
      height: 1200,
    });
    expect(drawings).toEqual([
      { type: "image/webp", quality: 0.82, width: 1600, height: 1200 },
    ]);
  });

  it("steps the quality down until it is about 500 KB", async () => {
    sizeOf = (d) => (d.quality > 0.75 ? 600_000 : 450_000);
    const page = await encodeDocumentPhoto(photo());
    expect(page.blob.size).toBe(450_000);
    expect(drawings.map((d) => [longest(d), d.quality])).toEqual([
      [1600, 0.82],
      [1600, 0.72],
    ]);
  });

  it("keeps the smallest under 700 KB when none reaches 500 KB", async () => {
    sizeOf = (d) => (longest(d) === 1600 ? 690_000 + d.quality * 100 : 650_000);
    const page = await encodeDocumentPhoto(photo());
    expect(page.blob.size).toBe(650_000);
    expect(Math.max(page.width, page.height)).toBe(1280);
  });

  it("is too big when every drawing is over 700 KB, and lets the picture go", async () => {
    sizeOf = () => DOCUMENT_PHOTO_MAX_BYTES + 1;
    await expect(encodeDocumentPhoto(photo())).rejects.toMatchObject({
      problem: "tooBig",
    });
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("writes JPEG where the browser can't write WebP", async () => {
    writesWebp = false;
    sizeOf = () => 300_000;
    const page = await encodeDocumentPhoto(photo());
    expect(page.blob.type).toBe("image/jpeg");
  });
});
