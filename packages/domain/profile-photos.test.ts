import { describe, expect, it } from "vitest";
import {
  checkProfilePhoto,
  hasPhotoMetadata,
  isAnimatedPhoto,
  isProfilePhotoPath,
  PROFILE_PHOTO_MAX_BYTES,
  photoDimensions,
  profilePhotoPath,
  profilePhotoSrc,
  sniffPhotoType,
  squareCrop,
  withoutJpegMetadata,
} from "./profile-photos";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
]);
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
]);
const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const wav = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
]);

const bytesOf = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === "string" ? [...part].map((c) => c.charCodeAt(0)) : part,
    ),
  );
const be16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [...be16(Math.floor(n / 0x10000)), ...be16(n)];
const le16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
const le24 = (n: number) => [...le16(n), (n >>> 16) & 0xff];
const le32 = (n: number) => [...le24(n), (n >>> 24) & 0xff];

// A JPEG as a phone writes one: SOI, an APP1 "Exif" block, APP0, the tables,
// the frame header, then the scan.
const exifSegment = [
  0xff,
  0xe1,
  0,
  16,
  ..."Exif\0\0MM\0*\0\0\0\b".split("").map((c) => c.charCodeAt(0)),
];
const jfif = [
  0xff,
  0xe0,
  0,
  16,
  ..."JFIF\0".split("").map((c) => c.charCodeAt(0)),
  1,
  1,
  0,
  0,
  1,
  0,
  1,
  0,
  0,
];
// A Huffman table (C4, among the frame markers) whose bytes would read as
// 9999 × 9999 if it were taken for the frame header.
const dht = [0xff, 0xc4, 0, 11, 0x10, ...be16(9999), ...be16(9999), 0, 0, 0, 0];
/** SOF0 (or another frame marker): precision 8, height, width, one component. */
const frame = (width: number, height: number, marker = 0xc0) => [
  0xff,
  marker,
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
const jpegOf = (width: number, height: number, marker = 0xc0) =>
  bytesOf([0xff, 0xd8], jfif, dht, frame(width, height, marker), scan);
const cameraJpeg = bytesOf(
  [0xff, 0xd8],
  exifSegment,
  jfif,
  dht,
  frame(512, 512),
  scan,
);
const plainJpeg = jpegOf(512, 512);

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngChunk = (type: string, data: number[]) => [
  0,
  0,
  0,
  data.length,
  ...[...type].map((c) => c.charCodeAt(0)),
  ...data,
  0,
  0,
  0,
  0,
];
const ihdr = (width: number, height: number) =>
  pngChunk("IHDR", [...be32(width), ...be32(height), 8, 2, 0, 0, 0]);
const pngOf = (width: number, height: number, ...chunks: number[][]) =>
  bytesOf(
    pngSignature,
    ihdr(width, height),
    ...chunks,
    pngChunk("IDAT", [1, 2]),
    pngChunk("IEND", []),
  );
const apng = pngOf(512, 512, pngChunk("acTL", [0, 0, 0, 2, 0, 0, 0, 0]));

const riff = (...chunks: number[][]) =>
  bytesOf("RIFF", [0x24, 0, 0, 0], "WEBP", ...chunks);
const webpChunk = (type: string, data: number[]) => [
  ...[...type].map((c) => c.charCodeAt(0)),
  data.length,
  0,
  0,
  0,
  ...data,
  ...(data.length % 2 ? [0] : []),
];
/** A lossy key frame: the frame tag, the start code, 14-bit sizes. */
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
/** A lossless one: the signature, then 14-bit sizes less one. */
const vp8l = (width: number, height: number) =>
  webpChunk("VP8L", [0x2f, ...le32((width - 1) | ((height - 1) << 14)), 0]);
/** The extended header: flags, then the canvas, 24-bit sizes less one. */
const vp8x = (flags: number, width: number, height: number) =>
  webpChunk("VP8X", [flags, 0, 0, 0, ...le24(width - 1), ...le24(height - 1)]);

const check = (bytes: Uint8Array, type: string) =>
  checkProfilePhoto({ type, size: bytes.length, bytes });

describe("sniffPhotoType", () => {
  it("reads JPEG, PNG and WebP from their first bytes", () => {
    expect(sniffPhotoType(jpeg)).toBe("image/jpeg");
    expect(sniffPhotoType(png)).toBe("image/png");
    expect(sniffPhotoType(webp)).toBe("image/webp");
  });

  it("refuses other files, including other RIFF files", () => {
    expect(sniffPhotoType(gif)).toBeNull();
    expect(sniffPhotoType(wav)).toBeNull();
    expect(sniffPhotoType(new Uint8Array())).toBeNull();
  });
});

describe("checkProfilePhoto", () => {
  it("accepts a 512 px photo whose bytes match its type", () => {
    expect(check(pngOf(512, 512), "image/png")).toEqual({
      ok: true,
      type: "image/png",
      extension: "png",
    });
    expect(check(plainJpeg, "image/jpeg")).toMatchObject({
      ok: true,
      extension: "jpg",
    });
    expect(check(riff(vp8(512, 512)), "image/webp")).toMatchObject({
      ok: true,
      extension: "webp",
    });
    expect(check(riff(vp8l(512, 512)), "image/webp")).toMatchObject({
      ok: true,
    });
    expect(
      check(
        riff(vp8x(0x10, 512, 512), webpChunk("ALPH", [0, 1]), vp8(512, 512)),
        "image/webp",
      ),
    ).toMatchObject({ ok: true });
  });

  it("refuses a type the browser claims but the bytes deny", () => {
    expect(check(gif, "image/jpeg")).toEqual({ ok: false, problem: "type" });
    expect(check(plainJpeg, "image/png")).toEqual({
      ok: false,
      problem: "type",
    });
    expect(check(gif, "image/gif")).toEqual({ ok: false, problem: "type" });
  });

  it("refuses an empty file", () => {
    expect(check(new Uint8Array(), "image/png")).toEqual({
      ok: false,
      problem: "empty",
    });
  });

  it("takes 2MB and refuses a byte more", () => {
    const at = (size: number) => {
      const bytes = new Uint8Array(size);
      bytes.set(plainJpeg);
      return checkProfilePhoto({ type: "image/jpeg", size, bytes });
    };
    expect(at(PROFILE_PHOTO_MAX_BYTES).ok).toBe(true);
    expect(at(PROFILE_PHOTO_MAX_BYTES + 1)).toEqual({
      ok: false,
      problem: "tooBig",
    });
  });

  it("takes a smaller square, but nothing larger than 512 px or not square", () => {
    const pixels = { ok: false, problem: "pixels" };
    expect(check(pngOf(256, 256), "image/png")).toMatchObject({ ok: true });
    expect(check(pngOf(513, 512), "image/png")).toEqual(pixels);
    expect(check(pngOf(512, 511), "image/png")).toEqual(pixels);
    expect(check(pngOf(50000, 50000), "image/png")).toEqual(pixels);
    expect(check(pngOf(0, 0), "image/png")).toEqual(pixels);
    expect(check(jpegOf(4032, 4032), "image/jpeg")).toEqual(pixels);
    expect(check(jpegOf(1, 16383, 0xc2), "image/jpeg")).toEqual(pixels);
    expect(check(riff(vp8(16383, 16383)), "image/webp")).toEqual(pixels);
    expect(check(riff(vp8l(1024, 1024)), "image/webp")).toEqual(pixels);
    expect(
      check(riff(vp8x(0, 16384, 16384), vp8(512, 512)), "image/webp"),
    ).toEqual(pixels);
  });

  it("refuses a photo that moves", () => {
    const pixels = { ok: false, problem: "pixels" };
    expect(check(apng, "image/png")).toEqual(pixels);
    expect(
      check(riff(vp8x(0x02, 512, 512), vp8(512, 512)), "image/webp"),
    ).toEqual(pixels);
  });

  it("refuses a photo whose header is cut off", () => {
    const pixels = { ok: false, problem: "pixels" };
    expect(check(png, "image/png")).toEqual(pixels);
    expect(check(webp, "image/webp")).toEqual(pixels);
    expect(check(jpeg, "image/jpeg")).toEqual(pixels);
  });
});

describe("photoDimensions", () => {
  it("reads the size from a PNG's IHDR", () => {
    expect(photoDimensions(pngOf(512, 512), "image/png")).toEqual({
      width: 512,
      height: 512,
    });
    expect(photoDimensions(pngOf(50000, 40000), "image/png")).toEqual({
      width: 50000,
      height: 40000,
    });
  });

  it("reads a JPEG's frame header, not the Huffman table before it", () => {
    expect(photoDimensions(plainJpeg, "image/jpeg")).toEqual({
      width: 512,
      height: 512,
    });
    // Progressive (SOF2), wide.
    expect(photoDimensions(jpegOf(640, 480, 0xc2), "image/jpeg")).toEqual({
      width: 640,
      height: 480,
    });
  });

  it("reads VP8, VP8L and the VP8X canvas in a WebP", () => {
    expect(photoDimensions(riff(vp8(512, 300)), "image/webp")).toEqual({
      width: 512,
      height: 300,
    });
    expect(photoDimensions(riff(vp8l(300, 512)), "image/webp")).toEqual({
      width: 300,
      height: 512,
    });
    expect(
      photoDimensions(
        riff(vp8x(0, 512, 512), webpChunk("ICCP", [1, 2]), vp8l(512, 512)),
        "image/webp",
      ),
    ).toEqual({ width: 512, height: 512 });
  });

  it("refuses a canvas the picture doesn't fill, and a WebP with no picture", () => {
    expect(
      photoDimensions(riff(vp8x(0, 512, 512), vp8(4096, 4096)), "image/webp"),
    ).toBeNull();
    expect(photoDimensions(riff(vp8x(0, 512, 512)), "image/webp")).toBeNull();
    expect(
      photoDimensions(
        riff(webpChunk("ALPH", [0, 1]), vp8(512, 512)),
        "image/webp",
      ),
    ).toBeNull();
  });

  it("answers null for a header cut short, without throwing", () => {
    expect(photoDimensions(new Uint8Array(), "image/png")).toBeNull();
    expect(photoDimensions(png, "image/png")).toBeNull();
    expect(
      photoDimensions(
        bytesOf(pngSignature, [0, 0, 0, 13], "IHDR", [0, 0, 2]),
        "image/png",
      ),
    ).toBeNull();
    expect(photoDimensions(jpeg, "image/jpeg")).toBeNull();
    expect(
      photoDimensions(
        bytesOf([0xff, 0xd8], jfif, [0xff, 0xc0, 0, 11, 8, 0x02]),
        "image/jpeg",
      ),
    ).toBeNull();
    // The scan comes before any frame header.
    expect(
      photoDimensions(bytesOf([0xff, 0xd8], jfif, scan), "image/jpeg"),
    ).toBeNull();
    expect(photoDimensions(webp, "image/webp")).toBeNull();
    expect(
      photoDimensions(
        bytesOf("RIFF", [0x24, 0, 0, 0], "WEBP", "VP8 ", [10, 0, 0, 0, 0x50]),
        "image/webp",
      ),
    ).toBeNull();
  });
});

describe("isAnimatedPhoto", () => {
  it("finds an APNG's acTL", () => {
    expect(isAnimatedPhoto(apng, "image/png")).toBe(true);
    expect(isAnimatedPhoto(pngOf(512, 512), "image/png")).toBe(false);
  });

  it("finds VP8X's animation flag and ANIM or ANMF chunks in a WebP", () => {
    expect(
      isAnimatedPhoto(riff(vp8x(0x02, 512, 512), vp8(512, 512)), "image/webp"),
    ).toBe(true);
    expect(
      isAnimatedPhoto(
        riff(
          vp8x(0, 512, 512),
          webpChunk("ANIM", [0, 0, 0, 0, 0, 0]),
          webpChunk("ANMF", [0, 0]),
        ),
        "image/webp",
      ),
    ).toBe(true);
    expect(
      isAnimatedPhoto(riff(vp8x(0x10, 512, 512), vp8(512, 512)), "image/webp"),
    ).toBe(false);
    expect(isAnimatedPhoto(riff(vp8(512, 512)), "image/webp")).toBe(false);
  });

  it("never finds one in a JPEG", () => {
    expect(isAnimatedPhoto(plainJpeg, "image/jpeg")).toBe(false);
  });
});

describe("profile photo paths", () => {
  const user = "69000000-0000-4000-a000-00000000000b";

  it("puts a photo in the person's folder", () => {
    const path = profilePhotoPath(user, "abcdefgh12", "jpg");
    expect(path).toBe(`${user}/abcdefgh12.jpg`);
    expect(isProfilePhotoPath(user, path)).toBe(true);
  });

  it("refuses another folder, other types, short keys and subfolders", () => {
    expect(
      isProfilePhotoPath(
        user,
        "69000000-0000-4000-a000-00000000000a/abcdefgh.jpg",
      ),
    ).toBe(false);
    expect(isProfilePhotoPath(user, `${user}/abcdefgh.gif`)).toBe(false);
    expect(isProfilePhotoPath(user, `${user}/abc.jpg`)).toBe(false);
    expect(isProfilePhotoPath(user, `${user}/x/abcdefgh.jpg`)).toBe(false);
  });
});

describe("squareCrop", () => {
  it("takes the centred square of a wide, a tall and a square picture", () => {
    expect(squareCrop(4032, 3024)).toEqual({ sx: 504, sy: 0, size: 3024 });
    expect(squareCrop(1080, 1920)).toEqual({ sx: 0, sy: 420, size: 1080 });
    expect(squareCrop(512, 512)).toEqual({ sx: 0, sy: 0, size: 512 });
  });
});

describe("hasPhotoMetadata", () => {
  it("finds EXIF in a JPEG, before its scan", () => {
    expect(hasPhotoMetadata(cameraJpeg, "image/jpeg")).toBe(true);
    expect(hasPhotoMetadata(plainJpeg, "image/jpeg")).toBe(false);
  });

  it("finds EXIF and text chunks in a PNG", () => {
    const pngWith = (type: string) =>
      bytesOf(
        pngSignature,
        pngChunk("IHDR", [0, 0, 0, 1]),
        pngChunk(type, [1, 2]),
      );
    expect(hasPhotoMetadata(pngWith("eXIf"), "image/png")).toBe(true);
    expect(hasPhotoMetadata(pngWith("tEXt"), "image/png")).toBe(true);
    expect(hasPhotoMetadata(pngWith("iTXt"), "image/png")).toBe(true);
    expect(hasPhotoMetadata(pngWith("zTXt"), "image/png")).toBe(true);
    expect(hasPhotoMetadata(pngWith("IDAT"), "image/png")).toBe(false);
  });

  it("finds EXIF and XMP chunks in a WebP, but not in a bare picture", () => {
    expect(
      hasPhotoMetadata(
        riff(
          webpChunk("VP8X", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
          webpChunk("EXIF", [1, 2, 3]),
        ),
        "image/webp",
      ),
    ).toBe(true);
    expect(
      hasPhotoMetadata(riff(webpChunk("XMP ", [1, 2])), "image/webp"),
    ).toBe(true);
    expect(
      hasPhotoMetadata(riff(webpChunk("VP8 ", [1, 2, 3, 4])), "image/webp"),
    ).toBe(false);
  });

  it("stops without throwing on a file cut short", () => {
    expect(hasPhotoMetadata(jpeg, "image/jpeg")).toBe(false);
    expect(hasPhotoMetadata(png, "image/png")).toBe(false);
    expect(hasPhotoMetadata(webp, "image/webp")).toBe(false);
    // Cut off inside the APP1 segment's length.
    expect(
      hasPhotoMetadata(bytesOf([0xff, 0xd8, 0xff, 0xe1, 0]), "image/jpeg"),
    ).toBe(false);
    // Cut inside a PNG chunk's header.
    expect(
      hasPhotoMetadata(
        bytesOf(pngSignature, [0, 0, 0, 4, 0x65, 0x58]),
        "image/png",
      ),
    ).toBe(false);
    // A length that runs far past the end.
    expect(
      hasPhotoMetadata(
        bytesOf([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff]),
        "image/jpeg",
      ),
    ).toBe(false);
    expect(hasPhotoMetadata(new Uint8Array(), "image/jpeg")).toBe(false);
  });

  it("is why the server refuses a camera's JPEG", () => {
    expect(check(cameraJpeg, "image/jpeg")).toEqual({
      ok: false,
      problem: "metadata",
    });
    expect(check(plainJpeg, "image/jpeg")).toMatchObject({
      ok: true,
      extension: "jpg",
    });
  });
});

describe("withoutJpegMetadata", () => {
  it("drops the APP1 block and keeps the rest byte for byte", () => {
    const stripped = withoutJpegMetadata(cameraJpeg);
    expect([...stripped]).toEqual([...plainJpeg]);
    expect(hasPhotoMetadata(stripped, "image/jpeg")).toBe(false);
    expect(check(stripped, "image/jpeg")).toMatchObject({ ok: true });
  });

  it("leaves a JPEG without one, a cut one and other files as they are", () => {
    expect(withoutJpegMetadata(plainJpeg)).toBe(plainJpeg);
    expect(withoutJpegMetadata(jpeg)).toBe(jpeg);
    expect(withoutJpegMetadata(png)).toBe(png);
  });
});

describe("profilePhotoSrc", () => {
  it("shows a photo through the app's own route", () => {
    expect(profilePhotoSrc(null)).toBeNull();
    expect(profilePhotoSrc(undefined)).toBeNull();
    expect(profilePhotoSrc("u/abcdefgh.webp")).toBe("/photos/u/abcdefgh.webp");
  });
});
