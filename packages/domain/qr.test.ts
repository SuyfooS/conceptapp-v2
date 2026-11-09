import { describe, expect, it } from "vitest";
import { parsePunchScan, punchPayload } from "./punch-code-format";
import { QR_QUIET_ZONE, qrMatrix, qrPath } from "./qr";
import { decodeQrImage, type QrImage } from "./qr-decode";

const CODE = "c0nceptApp-gallery-qr1";

/**
 * A matrix painted the way a screen shows it: black modules of `scale` pixels
 * on white, `offset` pixels in from the top and the start, in a square picture
 * with as much white again after it.
 */
function paint(
  matrix: boolean[][],
  scale: number,
  offset = 0,
): QrImage & { data: Uint8ClampedArray } {
  const side = matrix.length * scale + 2 * offset;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  matrix.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const at =
            ((offset + y * scale + dy) * side + offset + x * scale + dx) * 4;
          data.fill(0, at, at + 3);
        }
      }
    });
  });
  return { width: side, height: side, data };
}

describe("qrMatrix", () => {
  it("draws a quiet zone of four modules", () => {
    const matrix = qrMatrix(punchPayload(CODE));
    // Version 2 is 25 modules a side, plus the quiet zone on both sides.
    expect(matrix).toHaveLength(25 + 2 * QR_QUIET_ZONE);
    for (const row of matrix) expect(row).toHaveLength(matrix.length);
    const ring = matrix.flatMap((row, y) =>
      row.filter(
        (_, x) =>
          Math.min(x, y, matrix.length - 1 - x, matrix.length - 1 - y) <
          QR_QUIET_ZONE,
      ),
    );
    expect(ring.length).toBeGreaterThan(0);
    expect(ring.every((dark) => !dark)).toBe(true);
    // The finder's corner sits right inside it.
    expect(matrix[QR_QUIET_ZONE]?.[QR_QUIET_ZONE]).toBe(true);
    expect(qrPath(matrix).size).toBe(33);
  });

  it("is the same drawing for the same text, and another for another", () => {
    const a = qrPath(qrMatrix(punchPayload(CODE)));
    expect(qrPath(qrMatrix(punchPayload(CODE)))).toEqual(a);
    expect(qrPath(qrMatrix(punchPayload("x".repeat(22)))).d).not.toBe(a.d);
  });
});

describe("decodeQrImage", () => {
  it("reads back what it draws", () => {
    const text = punchPayload(CODE);
    const matrix = qrMatrix(text);
    expect(decodeQrImage(paint(matrix, 4))).toBe(text);
    // Smaller modules, off the corner: closer to what a camera crops.
    const read = decodeQrImage(paint(matrix, 3, 7));
    expect(read).toBe(text);
    expect(parsePunchScan(read ?? "")).toBe(CODE);
  });

  it("reads a code whatever its 22 characters are", () => {
    for (const code of [
      "A".repeat(22),
      "_-".repeat(11),
      "z9Y8x7W6v5U4t3S2r1Q0pO",
    ]) {
      expect(decodeQrImage(paint(qrMatrix(punchPayload(code)), 4))).toBe(
        punchPayload(code),
      );
    }
  });

  it("finds nothing in a blank picture", () => {
    const side = 120;
    const blank = new Uint8ClampedArray(side * side * 4).fill(255);
    expect(decodeQrImage({ width: side, height: side, data: blank })).toBe(
      null,
    );
    // Nor in a picture of half a code.
    const half = paint(qrMatrix(punchPayload(CODE)), 4);
    half.data.fill(255, half.data.length / 2);
    expect(decodeQrImage(half)).toBe(null);
  });
});

describe("qrPath", () => {
  it("draws each row's dark runs, and nothing for light modules", () => {
    expect(
      qrPath([
        [true, true, false, true],
        [false, false, false, false],
        [false, true, true, true],
        [true, false, false, false],
      ]),
    ).toEqual({
      size: 4,
      d: "M0 0h2v1h-2zM3 0h1v1h-1zM1 2h3v1h-3zM0 3h1v1h-1z",
    });
  });
});
