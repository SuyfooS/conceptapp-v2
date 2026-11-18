// Makes the demo's three sample documents (chat C7, plan §13) with Node's own
// modules and nothing else:
//
//   node tooling/demo-documents.mjs
//
// writes public/demo-documents/payslip.pdf, procedure.pdf and sick-note.webp,
// which /document-files serves for a demo business's sample documents (the
// rows' `sample`). Fake content, for no real business or person, marked as a
// sample on every page: "SAMPLE" in words and a large Hebrew "דוגמה" drawn in
// squares, since the PDFs' built-in fonts (Helvetica) have no Hebrew glyphs
// and the picture has no font at all. The rest of the text is English for the
// same reason. Each file is at most 100 KB and the same bytes on every run
// (tooling/demo-documents.test.ts checks the committed files against this).
//
// The picture is a lossless WebP (VP8L, RFC 9649) written here: a palette of
// four colours, four pixels to a byte, one prefix code per channel and no
// backward references. That is all a page of flat text needs, and what
// checkDocumentPhoto takes for a photo of a page: at most 1600 px on its long
// side, no metadata, not animated.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Glyphs drawn in squares: a 5 x 7 Latin font (capitals, digits, a little
// punctuation) for the picture, and the five Hebrew letters of "דוגמה" for
// every file. "#" is ink.

const LATIN = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  0: [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  1: ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  2: [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  3: ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."],
  4: ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  5: ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  6: ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  7: ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  8: [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  9: [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".##..", "..#..", ".#..."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "/": [".....", "....#", "...#.", "..#..", ".#...", "#....", "....."],
  "(": ["...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."],
  ")": [".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

// The letters of "דוגמה", each on a grid seven squares high.
const HEBREW = {
  ד: ["#####", "...#.", "...#.", "...#.", "...#.", "...#.", "...#."],
  ו: ["##", ".#", ".#", ".#", ".#", ".#", ".#"],
  ג: ["###.", "..#.", "..#.", "..#.", ".###", "#..#", "#..#"],
  מ: ["#.###", "##..#", "#...#", "#...#", "#...#", "#...#", "#.###"],
  ה: ["#####", "....#", "....#", "#...#", "#...#", "#...#", "#...#"],
};

/** The squares of "דוגמה" laid out left to right as it is read right to left. */
function sampleWordSquares() {
  const letters = [..."דוגמה"].reverse();
  const squares = [];
  let x = 0;
  for (const letter of letters) {
    const glyph = HEBREW[letter];
    glyph.forEach((row, y) => {
      [...row].forEach((cell, dx) => {
        if (cell === "#") squares.push({ x: x + dx, y });
      });
    });
    x += glyph[0].length + 1;
  }
  return { squares, width: x - 1, height: 7 };
}

// ---------------------------------------------------------------------------
// The picture: palette indices, drawn, then written as a lossless WebP.

const WHITE = 0;
const INK = 1;
const LIGHT = 2;
const RED = 3;
/** ARGB of each palette index. */
const PALETTE = [0xffffffff, 0xff1f2937, 0xffe5e7eb, 0xffc0392b];

function canvas(width, height) {
  const pixels = new Uint8Array(width * height).fill(WHITE);
  const fill = (x, y, w, h, color) => {
    for (let row = Math.max(0, y); row < Math.min(height, y + h); row += 1) {
      for (let col = Math.max(0, x); col < Math.min(width, x + w); col += 1) {
        pixels[row * width + col] = color;
      }
    }
  };
  const text = (words, x, y, scale, color) => {
    let at = x;
    for (const char of words.toUpperCase()) {
      const glyph = LATIN[char] ?? LATIN[" "];
      glyph.forEach((row, dy) => {
        [...row].forEach((cell, dx) => {
          if (cell === "#") {
            fill(at + dx * scale, y + dy * scale, scale, scale, color);
          }
        });
      });
      at += 6 * scale;
    }
  };
  const sampleWord = (x, y, scale, color) => {
    for (const square of sampleWordSquares().squares) {
      fill(x + square.x * scale, y + square.y * scale, scale, scale, color);
    }
  };
  return { width, height, pixels, fill, text, sampleWord };
}

/** The sick note: a photographed page, as a phone's would be sent. */
function sickNotePixels() {
  const page = canvas(800, 1131);
  const { fill, text, sampleWord } = page;
  // A stamp in the corner and a band across the top.
  fill(0, 0, 800, 150, LIGHT);
  text("MEDICAL CERTIFICATE", 56, 48, 4, INK);
  text("SAMPLE - NOT A REAL DOCUMENT", 56, 100, 3, RED);
  const word = sampleWordSquares();
  sampleWord(800 - 56 - word.width * 8, 40, 8, RED);

  const lines = [
    "DEMO CLINIC",
    "",
    "PATIENT: DEMO WORKER",
    "SICK LEAVE: 2 DAYS",
    "REASON: NOT GIVEN ON A SAMPLE",
    "",
    "DR. SAMPLE DOCTOR",
  ];
  lines.forEach((line, index) => {
    if (line) text(line, 56, 220 + index * 48, 4, INK);
  });
  // A signature line and a clinic stamp's box.
  fill(56, 640, 300, 3, INK);
  text("SIGNATURE", 56, 656, 3, INK);
  fill(480, 560, 4, 140, LIGHT);
  fill(480, 560, 264, 4, LIGHT);
  fill(740, 560, 4, 140, LIGHT);
  fill(480, 696, 264, 4, LIGHT);
  text("STAMP", 572, 616, 4, LIGHT);

  // The large mark across the page.
  sampleWord(Math.round((800 - word.width * 22) / 2), 780, 22, RED);
  text("SAMPLE", Math.round((800 - 35 * 6) / 2), 960, 6, RED);
  text("FOR THE CONCEPTAPP DEMO ONLY", 56, 1060, 3, INK);
  return page;
}

/** Bits written least significant first, as VP8L reads them. */
function bitWriter() {
  const bytes = [];
  let current = 0;
  let used = 0;
  return {
    put(value, count) {
      for (let i = 0; i < count; i += 1) {
        current |= ((value >>> i) & 1) << used;
        used += 1;
        if (used === 8) {
          bytes.push(current);
          current = 0;
          used = 0;
        }
      }
    },
    bytes() {
      return Uint8Array.from(used > 0 ? [...bytes, current] : bytes);
    },
  };
}

/**
 * A prefix code's lengths for these counts, none longer than `limit`: a
 * Huffman tree, its rarest counts raised (doubling a floor) until it is short
 * enough. Always a complete code when two or more symbols are used.
 */
function huffmanLengths(counts, limit) {
  const used = [];
  counts.forEach((count, symbol) => {
    if (count > 0) used.push(symbol);
  });
  const lengths = new Array(counts.length).fill(0);
  if (used.length === 0) return lengths;
  if (used.length === 1) {
    lengths[used[0]] = 1;
    return lengths;
  }
  for (let floor = 1; ; floor *= 2) {
    let nodes = used.map((symbol, order) => ({
      weight: Math.max(counts[symbol], floor),
      symbols: [symbol],
      order,
    }));
    let order = nodes.length;
    const depth = new Map(used.map((symbol) => [symbol, 0]));
    while (nodes.length > 1) {
      nodes.sort((a, b) => a.weight - b.weight || a.order - b.order);
      const [a, b] = nodes;
      for (const symbol of [...a.symbols, ...b.symbols]) {
        depth.set(symbol, depth.get(symbol) + 1);
      }
      nodes = [
        {
          weight: a.weight + b.weight,
          symbols: [...a.symbols, ...b.symbols],
          order,
        },
        ...nodes.slice(2),
      ];
      order += 1;
    }
    if (Math.max(...depth.values()) <= limit) {
      for (const [symbol, length] of depth) lengths[symbol] = length;
      return lengths;
    }
  }
}

/** Canonical codes for these lengths, shorter first, then by symbol (as DEFLATE's). */
function canonicalCodes(lengths) {
  const longest = Math.max(0, ...lengths);
  const count = new Array(longest + 1).fill(0);
  for (const length of lengths) if (length > 0) count[length] += 1;
  const next = new Array(longest + 1).fill(0);
  let code = 0;
  for (let bits = 1; bits <= longest; bits += 1) {
    code = (code + count[bits - 1]) << 1;
    next[bits] = code;
  }
  return lengths.map((length) => {
    if (length === 0) return 0;
    const assigned = next[length];
    next[length] += 1;
    return assigned;
  });
}

/** A code written for the reader: its first bit first. */
function reversed(code, length) {
  let out = 0;
  for (let i = 0; i < length; i += 1) out = (out << 1) | ((code >>> i) & 1);
  return out;
}

/** The order VP8L reads the code length code's lengths in. */
const CODE_LENGTH_ORDER = [
  17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
];

/**
 * Writes a prefix code for these symbol counts and returns how to write a
 * symbol with it: a simple code for one or two symbols under 256 (one symbol
 * is read with no bits at all), else a normal one with every length written
 * out by a code length code (no repeat codes).
 */
function writePrefixCode(bits, counts) {
  const used = [];
  counts.forEach((count, symbol) => {
    if (count > 0) used.push(symbol);
  });
  if (used.length === 0) used.push(0);
  if (used.length <= 2 && used.every((symbol) => symbol < 256)) {
    bits.put(1, 1);
    bits.put(used.length - 1, 1);
    const wide = used[0] > 1 ? 1 : 0;
    bits.put(wide, 1);
    bits.put(used[0], wide ? 8 : 1);
    if (used.length === 2) bits.put(used[1], 8);
    if (used.length === 1) return () => {};
    const lengths = new Array(counts.length).fill(0);
    lengths[used[0]] = 1;
    lengths[used[1]] = 1;
    const codes = canonicalCodes(lengths);
    return (symbol) => bits.put(reversed(codes[symbol], 1), 1);
  }
  const lengths = huffmanLengths(counts, 15);
  const lengthCounts = new Array(19).fill(0);
  for (const length of lengths) lengthCounts[length] += 1;
  // A code length code of one symbol is read with no bits: give it a second.
  if (lengthCounts.filter((count) => count > 0).length === 1) {
    lengthCounts[lengthCounts[0] > 0 ? 1 : 0] += 1;
  }
  const lengthLengths = huffmanLengths(lengthCounts, 7);
  const lengthCodes = canonicalCodes(lengthLengths);
  bits.put(0, 1);
  bits.put(19 - 4, 4);
  for (const symbol of CODE_LENGTH_ORDER) bits.put(lengthLengths[symbol], 3);
  // Lengths for the whole alphabet.
  bits.put(0, 1);
  for (const length of lengths) {
    bits.put(
      reversed(lengthCodes[length], lengthLengths[length]),
      lengthLengths[length],
    );
  }
  const codes = canonicalCodes(lengths);
  return (symbol) =>
    bits.put(reversed(codes[symbol], lengths[symbol]), lengths[symbol]);
}

/** Writes pixels (ARGB) as an entropy-coded image: no colour cache, one code group. */
function writeEntropyImage(bits, argb) {
  const counts = {
    green: new Array(256 + 24).fill(0),
    red: new Array(256).fill(0),
    blue: new Array(256).fill(0),
    alpha: new Array(256).fill(0),
  };
  for (const pixel of argb) {
    counts.alpha[(pixel >>> 24) & 0xff] += 1;
    counts.red[(pixel >>> 16) & 0xff] += 1;
    counts.green[(pixel >>> 8) & 0xff] += 1;
    counts.blue[pixel & 0xff] += 1;
  }
  const green = writePrefixCode(bits, counts.green);
  const red = writePrefixCode(bits, counts.red);
  const blue = writePrefixCode(bits, counts.blue);
  const alpha = writePrefixCode(bits, counts.alpha);
  // Distance: never used, a code of one symbol.
  writePrefixCode(bits, new Array(40).fill(0));
  for (const pixel of argb) {
    green((pixel >>> 8) & 0xff);
    red((pixel >>> 16) & 0xff);
    blue(pixel & 0xff);
    alpha((pixel >>> 24) & 0xff);
  }
}

/** A picture of palette indices (at most four colours) as a lossless WebP. */
export function webpOf({ width, height, pixels }, palette = PALETTE) {
  const bits = bitWriter();
  bits.put(0x2f, 8);
  bits.put(width - 1, 14);
  bits.put(height - 1, 14);
  bits.put(0, 1); // no alpha
  bits.put(0, 3); // version 0

  // The colour indexing transform: the palette, each entry as its difference
  // from the one before, per channel.
  bits.put(1, 1);
  bits.put(3, 2);
  bits.put(palette.length - 1, 8);
  bits.put(0, 1); // no colour cache in the palette's image
  writeEntropyImage(
    bits,
    palette.map((color, index) => {
      if (index === 0) return color >>> 0;
      const before = palette[index - 1];
      let delta = 0;
      for (let shift = 0; shift < 32; shift += 8) {
        const value =
          (((color >>> shift) & 0xff) - ((before >>> shift) & 0xff)) & 0xff;
        delta |= value << shift;
      }
      return delta >>> 0;
    }),
  );
  bits.put(0, 1); // no more transforms

  // Four indices of two bits to a pixel's green, the first in the lowest bits.
  const packedWidth = Math.ceil(width / 4);
  const packed = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < packedWidth; x += 1) {
      let green = 0;
      for (let k = 0; k < 4; k += 1) {
        const column = x * 4 + k;
        if (column < width) green |= pixels[y * width + column] << (2 * k);
      }
      packed.push((0xff000000 | (green << 8)) >>> 0);
    }
  }
  bits.put(0, 1); // no colour cache
  bits.put(0, 1); // no meta prefix codes
  writeEntropyImage(bits, packed);

  const stream = bits.bytes();
  const padded = stream.length % 2 === 1;
  const out = new Uint8Array(12 + 8 + stream.length + (padded ? 1 : 0));
  const view = new DataView(out.buffer);
  out.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  view.setUint32(4, out.length - 8, true);
  out.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  out.set([0x56, 0x50, 0x38, 0x4c], 12); // VP8L
  view.setUint32(16, stream.length, true);
  out.set(stream, 20);
  return out;
}

// ---------------------------------------------------------------------------
// The PDFs: one A4 page each, text in Helvetica, "דוגמה" in squares.

const ESCAPES = /[()\\]/g;

/** One PDF page from its content stream, with Helvetica and its bold. */
export function pdfOf(title, content) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Title (${title.replace(ESCAPES, "")}) /Producer (ConceptApp demo) >>`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(Buffer.from(body, "latin1"));
}

/** A page's drawing, in PDF's own operators. */
function page() {
  const ops = [];
  const n = (value) => Number(value.toFixed(2)).toString();
  const color = ([r, g, b]) => `${n(r)} ${n(g)} ${n(b)} rg`;
  const api = {
    rect(x, y, w, h, rgb) {
      ops.push(`${color(rgb)} ${n(x)} ${n(y)} ${n(w)} ${n(h)} re f`);
      return api;
    },
    text(words, x, y, size, rgb, bold = false) {
      ops.push(
        `BT ${color(rgb)} /${bold ? "F2" : "F1"} ${size} Tf ${n(x)} ${n(y)} Td (${words.replace(ESCAPES, "")}) Tj ET`,
      );
      return api;
    },
    /** "דוגמה" with its top left at (x, y), squares of `size`, turned `degrees`. */
    sampleWord(x, y, size, rgb, degrees = 0) {
      const radians = (degrees * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      ops.push(
        `q ${n(cos)} ${n(sin)} ${n(-sin)} ${n(cos)} ${n(x)} ${n(y)} cm ${color(rgb)}`,
      );
      for (const square of sampleWordSquares().squares) {
        ops.push(
          `${n(square.x * size)} ${n(-(square.y + 1) * size)} ${n(size)} ${n(size)} re`,
        );
      }
      ops.push("f Q");
      return api;
    },
    content: () => ops.join("\n"),
  };
  return api;
}

const INK_RGB = [0.12, 0.16, 0.22];
const SOFT_RGB = [0.9, 0.91, 0.92];
const RED_RGB = [0.75, 0.22, 0.17];
const FAINT_RED_RGB = [0.98, 0.88, 0.87];

/** The frame every sample page shares: the band, the stamp, the big mark and the footer. */
function framed(heading, draw) {
  const p = page();
  // The large faint mark first, under everything.
  const word = sampleWordSquares();
  p.sampleWord(170, 560, 13, FAINT_RED_RGB, 28);
  p.rect(0, 742, 595, 100, SOFT_RGB);
  p.text(heading, 48, 800, 20, INK_RGB, true);
  p.text("SAMPLE - NOT A REAL DOCUMENT", 48, 772, 11, RED_RGB, true);
  p.sampleWord(595 - 48 - word.width * 5, 812, 5, RED_RGB);
  draw(p);
  p.text(
    "This is a sample for the ConceptApp demo. It belongs to no real business or person.",
    48,
    48,
    9,
    INK_RGB,
  );
  return p.content();
}

function payslipPdf() {
  return pdfOf(
    "Sample payslip - ConceptApp demo",
    framed("PAYSLIP", (p) => {
      const rows = [
        ["Business", "Demo Business (not a real company)"],
        ["Employee", "Demo Worker"],
        ["Month", "A sample month"],
        ["Hours worked", "160.00"],
        ["Hourly rate", "0.00"],
        ["Gross pay", "0.00"],
        ["Deductions", "0.00"],
        ["Net pay", "0.00"],
      ];
      rows.forEach(([label, value], index) => {
        const y = 690 - index * 30;
        if (index % 2 === 0) p.rect(48, y - 9, 499, 26, [0.97, 0.97, 0.98]);
        p.text(label, 60, y, 12, INK_RGB, true);
        p.text(value, 260, y, 12, INK_RGB);
      });
      p.rect(48, 418, 499, 1.5, INK_RGB);
      p.text("All amounts on a sample are zero.", 60, 396, 10, INK_RGB);
    }),
  );
}

function procedurePdf() {
  return pdfOf(
    "Sample procedure - ConceptApp demo",
    framed("PROCEDURE: CLOSING THE SHIFT", (p) => {
      const steps = [
        "1. Finish what is open, and hand over anything left to the next shift.",
        "2. Put the tools and the stock back in their places.",
        "3. Check that the space is clean, safe and locked where it should be.",
        "4. Clock out in the app before leaving.",
        "5. Tell the manager on shift about anything broken or missing.",
      ];
      p.text(
        "Every person on the team, at the end of each shift:",
        48,
        690,
        12,
        INK_RGB,
        true,
      );
      steps.forEach((step, index) => {
        p.text(step, 60, 656 - index * 28, 12, INK_RGB);
      });
      p.rect(48, 470, 499, 1.5, INK_RGB);
      p.text(
        'Press "I have read it" in the app once you have read it.',
        48,
        448,
        11,
        INK_RGB,
      );
    }),
  );
}

/** Every sample, by its file's name in public/demo-documents/. */
export function demoDocuments() {
  return {
    "payslip.pdf": payslipPdf(),
    "procedure.pdf": procedurePdf(),
    "sick-note.webp": webpOf(sickNotePixels()),
  };
}

/** The sick note's pixels, as ARGB, for a test to compare a decoder's with. */
export function sickNoteArgb() {
  const { width, height, pixels } = sickNotePixels();
  return {
    width,
    height,
    argb: Array.from(pixels, (index) => PALETTE[index] >>> 0),
  };
}

const here = dirname(fileURLToPath(import.meta.url));
if (
  process.argv[1] &&
  join(process.argv[1]) === join(fileURLToPath(import.meta.url))
) {
  const folder = join(here, "..", "public", "demo-documents");
  mkdirSync(folder, { recursive: true });
  for (const [name, bytes] of Object.entries(demoDocuments())) {
    writeFileSync(join(folder, name), bytes);
    console.log(`${name}: ${bytes.length} bytes`);
  }
}
