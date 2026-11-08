import { describe, expect, it } from "vitest";
import { punchPayload } from "./punch-code-format";
import { QR_QUIET_ZONE, qrMatrix, qrPath } from "./qr";

const CODE = "c0nceptApp-gallery-qr1";

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
