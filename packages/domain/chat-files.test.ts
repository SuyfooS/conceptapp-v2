import { describe, expect, it } from "vitest";
import {
  CHAT_FILE_NAME_MAX,
  CHAT_IMAGE_MAX_BYTES,
  CHAT_PDF_MAX_BYTES,
  CHAT_THUMB_MAX_BYTES,
  CHAT_THUMB_PIXELS,
  CHAT_THUMB_STEPS,
  chatFilePath,
  chatFileSrc,
  chatImageTypeOf,
  chatThumbVerdict,
  checkChatImage,
  checkChatThumb,
  cleanFileName,
  contentDisposition,
  FILES_GUARD_BYTES,
  isChatFileName,
  isChatFilePath,
  isChatFileSrc,
  parseChatFilePath,
  rfc5987,
} from "./chat-files";

// Small files in the shapes the browser writes, built byte by byte as in
// list-photos.test.ts: what the checks read is their headers.
const bytesOf = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === "string" ? [...part].map((c) => c.charCodeAt(0)) : part,
    ),
  );
const be16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];
const le16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
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
const jpegOf = (width: number, height: number) =>
  bytesOf([0xff, 0xd8], frame(width, height), scan);
const vp8 = (width: number, height: number) => [
  ..."VP8 ".split("").map((c) => c.charCodeAt(0)),
  10,
  0,
  0,
  0,
  0x50,
  0x02,
  0x00,
  0x9d,
  0x01,
  0x2a,
  ...le16(width),
  ...le16(height),
];
const webpOf = (width: number, height: number) =>
  bytesOf("RIFF", [0x24, 0, 0, 0], "WEBP", vp8(width, height));

const BUSINESS = "0a000000-0000-4000-b000-000000000001";
const CONVERSATION = "0b000000-0000-4000-c000-000000000002";
const KEY = "0123456789abcdef0123456789abcdef";
// The marks that turn text around, by code point (never typed into the source).
const LRM = String.fromCodePoint(0x200e);
const RLM = String.fromCodePoint(0x200f);
const RLO = String.fromCodePoint(0x202e);

describe("the sizes", () => {
  it("are the database's", () => {
    // public.reserve_chat_upload takes a picture and its thumbnail of at most
    // 448 KB together, private.attach_chat_upload each at most 400 KB and
    // 48 KB, a PDF 10 MiB; private.files_guard_bytes is 900 MB.
    expect(CHAT_IMAGE_MAX_BYTES).toBe(409_600);
    expect(CHAT_THUMB_MAX_BYTES).toBe(49_152);
    expect(CHAT_IMAGE_MAX_BYTES + CHAT_THUMB_MAX_BYTES).toBe(458_752);
    expect(CHAT_PDF_MAX_BYTES).toBe(10_485_760);
    expect(FILES_GUARD_BYTES).toBe(943_718_400);
  });

  it("draw a thumbnail no larger than the thumbnail's side", () => {
    for (const step of CHAT_THUMB_STEPS) {
      expect(step.pixels).toBeLessThanOrEqual(CHAT_THUMB_PIXELS);
      expect(step.quality).toBeGreaterThan(0);
      expect(step.quality).toBeLessThanOrEqual(1);
    }
  });
});

describe("chatThumbVerdict", () => {
  const max = CHAT_THUMB_MAX_BYTES;

  it("keeps the first encoding small enough", () => {
    expect(chatThumbVerdict([20_000])).toEqual({ keep: 0 });
    expect(chatThumbVerdict([max])).toEqual({ keep: 0 });
    expect(chatThumbVerdict([max + 1, 30_000])).toEqual({ keep: 1 });
  });

  it("tries the next step while there is one, and then gives up", () => {
    expect(chatThumbVerdict([])).toBe("next");
    expect(chatThumbVerdict([max + 1])).toBe("next");
    expect(chatThumbVerdict(CHAT_THUMB_STEPS.map(() => max + 1))).toBe(
      "tooBig",
    );
    expect(
      chatThumbVerdict([...CHAT_THUMB_STEPS.slice(1).map(() => max + 1), max]),
    ).toEqual({ keep: CHAT_THUMB_STEPS.length - 1 });
  });
});

describe("checkChatImage", () => {
  const check = (bytes: Uint8Array, type: string, size = bytes.length) =>
    checkChatImage({ type, size, bytes });

  it("takes the browser's WebP or JPEG, its longest side up to 1280 px", () => {
    expect(check(webpOf(1280, 960), "image/webp")).toEqual({
      ok: true,
      type: "image/webp",
      extension: "webp",
    });
    expect(check(jpegOf(720, 1280), "image/jpeg")).toEqual({
      ok: true,
      type: "image/jpeg",
      extension: "jpg",
    });
  });

  it("refuses a larger picture, one over 400 KB, and bytes not as said", () => {
    expect(check(webpOf(1281, 960), "image/webp")).toEqual({
      ok: false,
      problem: "pixels",
    });
    expect(check(webpOf(800, 600), "image/webp", 409_601)).toEqual({
      ok: false,
      problem: "tooBig",
    });
    expect(check(jpegOf(800, 600), "image/webp")).toEqual({
      ok: false,
      problem: "type",
    });
    expect(check(new Uint8Array(), "image/webp")).toEqual({
      ok: false,
      problem: "empty",
    });
  });
});

describe("checkChatThumb", () => {
  const check = (bytes: Uint8Array, type: string, size = bytes.length) =>
    checkChatThumb({ type, size, bytes });

  it("takes a thumbnail of up to 360 px and 48 KB", () => {
    expect(check(webpOf(360, 270), "image/webp").ok).toBe(true);
    expect(check(jpegOf(270, 360), "image/jpeg").ok).toBe(true);
  });

  it("refuses a larger one, which would cost what the thumbnail saves", () => {
    expect(check(webpOf(361, 270), "image/webp")).toEqual({
      ok: false,
      problem: "pixels",
    });
    expect(check(webpOf(360, 270), "image/webp", 49_153)).toEqual({
      ok: false,
      problem: "tooBig",
    });
  });
});

describe("chat file paths", () => {
  it("put a picture and its thumbnail in their conversation's folder", () => {
    expect(chatFilePath(BUSINESS, CONVERSATION, KEY, "webp")).toBe(
      `${BUSINESS}/${CONVERSATION}/${KEY}.webp`,
    );
    expect(chatFilePath(BUSINESS, CONVERSATION, KEY, "jpg", true)).toBe(
      `${BUSINESS}/${CONVERSATION}/${KEY}-s.jpg`,
    );
  });

  it("read back as the database makes them, and nothing else", () => {
    expect(
      parseChatFilePath(`${BUSINESS}/${CONVERSATION}/${KEY}-s.webp`),
    ).toEqual({
      businessId: BUSINESS,
      conversationId: CONVERSATION,
      key: KEY,
      thumb: true,
      extension: "webp",
    });
    for (const path of [
      `${BUSINESS}/${CONVERSATION}/${KEY}.png`,
      `${BUSINESS}/${CONVERSATION}/${KEY.slice(1)}.webp`,
      `${BUSINESS.toUpperCase()}/${CONVERSATION}/${KEY}.webp`,
      `${"-".repeat(36)}/${"-".repeat(36)}/${KEY}.webp`,
      `${BUSINESS}/${CONVERSATION}/../${KEY}.webp`,
      `${BUSINESS}/${KEY}.webp`,
      `/${BUSINESS}/${CONVERSATION}/${KEY}.webp`,
    ]) {
      expect(parseChatFilePath(path), path).toBeNull();
      expect(isChatFilePath(path), path).toBe(false);
    }
  });

  it("hold a path to its business's conversation when asked", () => {
    const path = chatFilePath(BUSINESS, CONVERSATION, KEY, "webp");
    expect(
      isChatFilePath(path, {
        businessId: BUSINESS,
        conversationId: CONVERSATION,
      }),
    ).toBe(true);
    expect(
      isChatFilePath(path, {
        businessId: CONVERSATION,
        conversationId: BUSINESS,
      }),
    ).toBe(false);
  });

  it("name a file inside its folder", () => {
    expect(isChatFileName(`${KEY}.webp`)).toBe(true);
    expect(isChatFileName(`${KEY}-s.jpg`)).toBe(true);
    expect(isChatFileName(`${KEY}.pdf`)).toBe(true);
    expect(isChatFileName(`${KEY}.svg`)).toBe(false);
    expect(isChatFileName("photo.webp")).toBe(false);
  });

  it("tell a picture's type from its extension", () => {
    expect(chatImageTypeOf("webp")).toBe("image/webp");
    expect(chatImageTypeOf("jpg")).toBe("image/jpeg");
    expect(chatImageTypeOf("pdf")).toBeNull();
  });

  it("are shown through the app's own route, and only in their shape", () => {
    const path = chatFilePath(BUSINESS, CONVERSATION, KEY, "webp");
    expect(chatFileSrc(path)).toBe(`/chat-files/${path}`);
    expect(chatFileSrc(null)).toBeNull();
    expect(chatFileSrc("javascript:alert(1)")).toBeNull();
    expect(isChatFileSrc(`/chat-files/${path}`)).toBe(true);
    expect(isChatFileSrc(`https://example.com/chat-files/${path}`)).toBe(false);
    expect(isChatFileSrc(`/list-photos/${path}`)).toBe(false);
  });
});

describe("cleanFileName", () => {
  it("keeps a name as people write it, Hebrew included", () => {
    expect(cleanFileName("אישור מחלה.pdf")).toBe("אישור מחלה.pdf");
    expect(cleanFileName("  menu  2026 .pdf ")).toBe("menu 2026 .pdf");
  });

  it("keeps no quote, CR, LF, direction mark or folder", () => {
    const cleaned =
      cleanFileName(`a"b\r\nc${RLO}fdp.exe${RLM}\\..\\/etc/passwd.pdf`) ?? "";
    for (const unsafe of ['"', "\r", "\n", RLO, RLM, "/", "\\"]) {
      expect(cleaned).not.toContain(unsafe);
    }
    expect(cleaned.endsWith(".pdf")).toBe(true);
  });

  it("is null when nothing is left", () => {
    expect(cleanFileName("")).toBeNull();
    expect(cleanFileName(` ${LRM}${RLO} `)).toBeNull();
    expect(cleanFileName("...")).toBeNull();
  });

  it("cuts a long name to 120 characters and keeps its extension", () => {
    const cleaned = cleanFileName(`${"א".repeat(200)}.pdf`) ?? "";
    expect([...cleaned].length).toBe(CHAT_FILE_NAME_MAX);
    expect(cleaned.endsWith(".pdf")).toBe(true);
    expect([...(cleanFileName("ב".repeat(130)) ?? "")].length).toBe(
      CHAT_FILE_NAME_MAX,
    );
  });
});

describe("contentDisposition", () => {
  it("is an attachment with an ASCII name and the real one in UTF-8 (RFC 5987)", () => {
    expect(contentDisposition("אישור מחלה.pdf")).toBe(
      `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent("אישור מחלה.pdf")}`,
    );
    expect(contentDisposition("menu (1)'s.pdf")).toBe(
      `attachment; filename="document.pdf"; filename*=UTF-8''menu%20%281%29%27s.pdf`,
    );
  });

  it("lets nothing break out of the header", () => {
    const header = contentDisposition(
      'x"; filename="evil.html\r\nSet-Cookie: a=b',
    );
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.split('"').length).toBe(3);
    expect(
      header.startsWith('attachment; filename="document.pdf"; filename*='),
    ).toBe(true);
  });

  it("gives the fallback alone for a name that cleans to nothing, and keeps the fallback ASCII", () => {
    expect(contentDisposition(null)).toBe(
      'attachment; filename="document.pdf"',
    );
    expect(contentDisposition(RLO)).toBe('attachment; filename="document.pdf"');
    expect(
      contentDisposition("a.pdf", {
        fallback: 'bad"name.pdf',
        disposition: "inline",
      }),
    ).toBe(`inline; filename="document.pdf"; filename*=UTF-8''a.pdf`);
  });

  it("encodes only what RFC 5987's attr-chars leave out", () => {
    expect(rfc5987("a-b_c.d~e!")).toBe("a-b_c.d~e!");
    expect(rfc5987("a b'c(d)*")).toBe("a%20b%27c%28d%29%2A");
  });
});
