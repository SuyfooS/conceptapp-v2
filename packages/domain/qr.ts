import encodeQR from "qr";

/*
 * Drawing a QR code (`qr` 0.7.2, exactly). Error correction M reads well on a
 * phone held up to another phone; the clock's 26 characters fit version 2
 * (25 modules), so a camera locks on fast.
 */

/** Modules of light around the code, which readers need to find it. */
export const QR_QUIET_ZONE = 4;

/** The code as modules, error correction M, with the quiet zone included (qr refuses border 0). */
export function qrMatrix(text: string): boolean[][] {
  return encodeQR(text, "raw", { ecc: "medium", border: QR_QUIET_ZONE });
}

/**
 * One SVG path for the dark modules, a run of them per row at a time. The
 * side length is the matrix's, quiet zone included.
 */
export function qrPath(matrix: readonly (readonly boolean[])[]): {
  size: number;
  d: string;
} {
  const runs: string[] = [];
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      let width = 1;
      while (row[x + width]) width += 1;
      runs.push(`M${x} ${y}h${width}v1h-${width}z`);
      x += width;
    }
  });
  return { size: matrix.length, d: runs.join("") };
}
