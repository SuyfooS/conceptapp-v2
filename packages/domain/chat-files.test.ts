import { describe, expect, it } from "vitest";
import {
  CHAT_FILE_NAME_MAX,
  CHAT_IMAGE_MAX_BYTES,
  CHAT_PDF_ACCEPT,
  CHAT_PDF_FALLBACK_NAME,
  CHAT_PDF_HEAD_BYTES,
  CHAT_PDF_MAX_BYTES,
  CHAT_PDF_TYPE,
  CHAT_PDFS_WAITING_MAX,
  CHAT_THUMB_MAX_BYTES,
  CHAT_THUMB_PIXELS,
  CHAT_THUMB_STEPS,
  chatFileKindOf,
  chatFilePath,
  chatFileSize,
  chatFileSrc,
  chatImageTypeOf,
  chatPdfCancelInput,
  chatPdfDisposition,
  chatPdfFinishInput,
  chatPdfStartInput,
  chatPlaceTombstone,
  chatThumbVerdict,
  checkChatImage,
  checkChatPdf,
  checkChatThumb,
  cleanFileName,
  contentDisposition,
  FILES_GUARD_BYTES,
  isChatFileName,
  isChatFilePath,
  isChatFileSrc,
  isPdf,
  isPdfName,
  isPlaceTombstone,
  parseChatFilePath,
  pickedPdfName,
  rfc5987,
  shownFileName,
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

describe("shownFileName", () => {
  it("leaves out the extension the line under it says, whatever its case", () => {
    expect(shownFileName("תפריט סתיו 2026.pdf")).toBe("תפריט סתיו 2026");
    expect(shownFileName("Payslip.PDF")).toBe("Payslip");
  });

  it("keeps a name that would be left with nothing, and any other dot", () => {
    expect(shownFileName(".pdf")).toBe(".pdf");
    expect(shownFileName("גרסה 1.2 סופית.pdf")).toBe("גרסה 1.2 סופית");
    expect(shownFileName("notes.pdf.txt")).toBe("notes.pdf.txt");
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

describe("PDFs", () => {
  const DRAFT = "0c000000-0000-4000-d000-000000000003";
  const PERSON = "0d000000-0000-4000-a000-000000000004";

  it("have the database's numbers", () => {
    // public.reserve_chat_upload and private.attach_chat_upload: a PDF is
    // application/pdf, at most 10 MiB; ten unsent from the last day each.
    expect(CHAT_PDF_TYPE).toBe("application/pdf");
    expect(CHAT_PDFS_WAITING_MAX).toBe(10);
    expect(CHAT_PDF_HEAD_BYTES).toBe(1024);
    expect(CHAT_PDF_FALLBACK_NAME).toMatch(/^[A-Za-z0-9._-]+\.pdf$/);
  });

  it("are told by their first bytes, at the very start", () => {
    expect(isPdf(bytesOf("%PDF-1.7\n%âã"))).toBe(true);
    expect(isPdf(bytesOf("%PDF-2.0"))).toBe(true);
    expect(isPdf(bytesOf("%PDF-"))).toBe(false);
    expect(isPdf(bytesOf("%PDF-x"))).toBe(false);
    expect(isPdf(bytesOf(" %PDF-1.7"))).toBe(false);
    expect(isPdf(bytesOf([0xef, 0xbb, 0xbf], "%PDF-1.7"))).toBe(false);
    expect(isPdf(bytesOf("<html><body>%PDF-1.7"))).toBe(false);
    expect(isPdf(bytesOf("%pdf-1.7"))).toBe(false);
    expect(isPdf(new Uint8Array())).toBe(false);
    expect(isPdf(webpOf(10, 10))).toBe(false);
    expect(isPdf(jpegOf(10, 10))).toBe(false);
  });

  it("leave a tombstone of one byte at a place let go, which is never a PDF", () => {
    const tombstone = chatPlaceTombstone();
    expect(tombstone.length).toBe(1);
    expect(isPlaceTombstone(tombstone)).toBe(true);
    expect(isPdf(tombstone)).toBe(false);
    // A new one each time: nothing written to one reaches the next.
    tombstone[0] = 1;
    expect(isPlaceTombstone(chatPlaceTombstone())).toBe(true);
    expect(isPlaceTombstone(tombstone)).toBe(false);
    expect(isPlaceTombstone(new Uint8Array())).toBe(false);
    expect(isPlaceTombstone(bytesOf([0, 0]))).toBe(false);
    expect(isPlaceTombstone(bytesOf("%PDF-1.7"))).toBe(false);
  });

  it("are a name ending in .pdf, of 1 byte to 10 MiB", () => {
    expect(checkChatPdf({ name: "תפריט 2026.pdf", size: 6_000_000 })).toEqual({
      ok: true,
      name: "תפריט 2026.pdf",
      size: 6_000_000,
    });
    expect(
      checkChatPdf({ name: "Menu.PDF", size: CHAT_PDF_MAX_BYTES }),
    ).toEqual({ ok: true, name: "Menu.PDF", size: CHAT_PDF_MAX_BYTES });
    expect(
      checkChatPdf({ name: "a.pdf", size: CHAT_PDF_MAX_BYTES + 1 }),
    ).toEqual({ ok: false, problem: "tooBig" });
    expect(checkChatPdf({ name: "a.pdf", size: 0 })).toEqual({
      ok: false,
      problem: "empty",
    });
    for (const size of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(checkChatPdf({ name: "a.pdf", size })).toEqual({
        ok: false,
        problem: "notPdf",
      });
    }
    for (const name of [
      "menu.docx",
      "menu.pdf.html",
      "menu",
      "",
      RLO,
      ".pdf",
    ]) {
      expect(checkChatPdf({ name, size: 10 })).toEqual({
        ok: false,
        problem: "notPdf",
      });
    }
  });

  it("keep their name cleaned, never a direction mark that turns it around", () => {
    const check = checkChatPdf({ name: `invoice${RLO}fdp.exe`, size: 10 });
    expect(check.ok).toBe(false);
    const turned = checkChatPdf({ name: `menu${RLM}\r\n"x".pdf`, size: 10 });
    expect(turned).toEqual({ ok: true, name: "menu x .pdf", size: 10 });
    expect(isPdfName("a.Pdf")).toBe(true);
    expect(isPdfName("a.pdf ")).toBe(false);
  });

  it("are a kind of file of their own, by extension", () => {
    expect(chatFileKindOf("pdf")).toBe("pdf");
    expect(chatFileKindOf("webp")).toBe("image");
    expect(chatFileKindOf("jpg")).toBe("image");
    const path = chatFilePath(BUSINESS, CONVERSATION, KEY, "pdf");
    expect(parseChatFilePath(path)).toEqual({
      businessId: BUSINESS,
      conversationId: CONVERSATION,
      key: KEY,
      thumb: false,
      extension: "pdf",
    });
    expect(chatFileSrc(path)).toBe(`/chat-files/${path}`);
  });

  it("go out as a download, named in UTF-8 with an ASCII fallback", () => {
    expect(chatPdfDisposition("אישור מחלה.pdf")).toBe(
      `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent("אישור מחלה.pdf")}`,
    );
    expect(chatPdfDisposition(null)).toBe(
      'attachment; filename="document.pdf"',
    );
    expect(chatPdfDisposition("")).toBe('attachment; filename="document.pdf"');
    // A name kept before the extension rule still downloads as a PDF.
    expect(chatPdfDisposition("menu")).toBe(
      `attachment; filename="document.pdf"; filename*=UTF-8''menu.pdf`,
    );
  });

  it("let no quote, CR, LF or direction mark reach the header, which stays ASCII", () => {
    const evil = [
      'x"; filename="evil.html\r\nSet-Cookie: a=b.pdf',
      `${RLO}fdp.exe.pdf`,
      `a${LRM}${RLM}${RLO}b.pdf`,
      "a\u0000b\u0085c d e⁦f⁩g﻿h.pdf",
      `${"א".repeat(300)}.pdf`,
      "..../etc/passwd.pdf",
    ];
    for (const name of evil) {
      const header = chatPdfDisposition(name);
      expect(header).toMatch(/^[\x20-\x7e]+$/);
      expect(header.split('"').length).toBe(3);
      expect(header).not.toMatch(/[\r\n]/);
      expect(
        header.startsWith('attachment; filename="document.pdf"; filename*='),
      ).toBe(true);
      const encoded = header.split("filename*=UTF-8''")[1] ?? "";
      expect(encoded).toMatch(/^[A-Za-z0-9!#$&+.^_`|~%-]+$/);
      const decoded = decodeURIComponent(encoded);
      for (const unsafe of ['"', "\r", "\n", "/", "\\", LRM, RLM, RLO]) {
        expect(decoded).not.toContain(unsafe);
      }
      expect(decoded.endsWith(".pdf")).toBe(true);
      expect([...decoded].length).toBeLessThanOrEqual(CHAT_FILE_NAME_MAX);
    }
  });

  it("are asked for with a draft, a name, a size and where, never as an announcement", () => {
    expect(
      chatPdfStartInput.parse({
        draft: DRAFT.toUpperCase(),
        name: "menu.pdf",
        size: 10,
        conversation: CONVERSATION,
      }),
    ).toEqual({
      draft: DRAFT,
      name: "menu.pdf",
      size: 10,
      conversation: CONVERSATION,
    });
    expect(
      chatPdfStartInput.safeParse({
        draft: DRAFT,
        name: "menu.pdf",
        size: 10,
        toPerson: PERSON,
      }).success,
    ).toBe(true);
    for (const wrong of [
      { draft: DRAFT, name: "menu.pdf", size: 10 },
      {
        draft: DRAFT,
        name: "menu.pdf",
        size: 10,
        conversation: CONVERSATION,
        toPerson: PERSON,
      },
      {
        draft: DRAFT,
        name: "menu.pdf",
        size: 10,
        conversation: CONVERSATION,
        announce: true,
      },
      { draft: "nope", name: "menu.pdf", size: 10, conversation: CONVERSATION },
      { draft: DRAFT, name: "menu.pdf", size: 1.5, conversation: CONVERSATION },
      {
        draft: DRAFT,
        name: "x".repeat(1001),
        size: 1,
        conversation: CONVERSATION,
      },
    ]) {
      expect(chatPdfStartInput.safeParse(wrong).success).toBe(false);
    }
  });

  it("are finished, or stopped, by their place", () => {
    const upload = "0e000000-0000-4000-e000-000000000005";
    expect(chatPdfFinishInput.parse({ upload, draft: DRAFT })).toEqual({
      upload,
      draft: DRAFT,
    });
    expect(
      chatPdfFinishInput.parse({ upload, draft: DRAFT, words: "התפריט החדש" }),
    ).toEqual({ upload, draft: DRAFT, words: "התפריט החדש" });
    expect(
      chatPdfFinishInput.safeParse({ upload, draft: DRAFT, path: "a/b.pdf" })
        .success,
    ).toBe(false);
    expect(
      chatPdfFinishInput.safeParse({ upload: "x", draft: DRAFT }).success,
    ).toBe(false);
    expect(chatPdfCancelInput.parse({ upload: upload.toUpperCase() })).toEqual({
      upload,
    });
  });
});

describe("a picked PDF", () => {
  it("keeps its name, and gets .pdf where the picker left it out", () => {
    expect(pickedPdfName({ name: "תפריט.pdf", type: CHAT_PDF_TYPE })).toBe(
      "תפריט.pdf",
    );
    expect(pickedPdfName({ name: "Menu.PDF", type: "" })).toBe("Menu.PDF");
    expect(pickedPdfName({ name: "תפריט", type: CHAT_PDF_TYPE })).toBe(
      "תפריט.pdf",
    );
    expect(pickedPdfName({ name: "scan.", type: CHAT_PDF_TYPE })).toBe(
      "scan.pdf",
    );
    expect(pickedPdfName({ name: "  ", type: CHAT_PDF_TYPE })).toBe(
      CHAT_PDF_FALLBACK_NAME,
    );
    // Anything else keeps its name, which checkChatPdf refuses.
    expect(pickedPdfName({ name: "notes.docx", type: "" })).toBe("notes.docx");
    expect(
      checkChatPdf({
        name: pickedPdfName({ name: "notes.docx", type: "" }),
        size: 10,
      }),
    ).toEqual({ ok: false, problem: "notPdf" });
    expect(CHAT_PDF_ACCEPT.split(",")).toEqual([CHAT_PDF_TYPE, ".pdf"]);
  });
});

describe("chatFileSize", () => {
  it("says kilobytes below a megabyte, never 0", () => {
    expect(chatFileSize(0)).toEqual({ unit: "kb", value: 1 });
    expect(chatFileSize(1)).toEqual({ unit: "kb", value: 1 });
    expect(chatFileSize(1024)).toEqual({ unit: "kb", value: 1 });
    expect(chatFileSize(1025)).toEqual({ unit: "kb", value: 2 });
    expect(chatFileSize(340 * 1024)).toEqual({ unit: "kb", value: 340 });
    expect(chatFileSize(1024 * 1024 - 1)).toEqual({ unit: "kb", value: 1024 });
  });

  it("says megabytes to a tenth, rounded up, so the limit reads 10", () => {
    expect(chatFileSize(1024 * 1024)).toEqual({ unit: "mb", value: 1 });
    expect(chatFileSize(2.4 * 1024 * 1024)).toEqual({ unit: "mb", value: 2.4 });
    expect(chatFileSize(2.41 * 1024 * 1024)).toEqual({
      unit: "mb",
      value: 2.5,
    });
    expect(chatFileSize(CHAT_PDF_MAX_BYTES)).toEqual({ unit: "mb", value: 10 });
    expect(chatFileSize(CHAT_PDF_MAX_BYTES - 1)).toEqual({
      unit: "mb",
      value: 10,
    });
    expect(chatFileSize(Number.NaN)).toEqual({ unit: "kb", value: 1 });
  });
});
