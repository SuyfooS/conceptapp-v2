import type { Page } from "@playwright/test";
import {
  hasPhotoMetadata,
  sniffPhotoType,
} from "../packages/domain/profile-photos";

/**
 * An EXIF block as a camera writes one, with its orientation: APP1 "Exif",
 * a big-endian TIFF header and one entry. What the app must never store.
 */
const EXIF = Buffer.from([
  0xff, 0xe1, 0x00, 0x22,
  // "Exif\0\0"
  0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
  // TIFF: "MM", 42, the first directory at 8
  0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
  // One entry: Orientation (0x0112), SHORT, 1, upright
  0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x00,
  // No next directory
  0x00, 0x00, 0x00, 0x00,
]);

/**
 * A JPEG as a phone writes one, larger than the app keeps and not square:
 * drawn on the page, with an EXIF block spliced in after SOI.
 */
export async function cameraPhoto(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 900;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D canvas");
    const sky = context.createLinearGradient(0, 0, 1200, 900);
    sky.addColorStop(0, "#f2b46d");
    sky.addColorStop(1, "#3d6fd1");
    context.fillStyle = sky;
    context.fillRect(0, 0, 1200, 900);
    context.fillStyle = "#fbe7d2";
    context.beginPath();
    context.arc(600, 420, 220, 0, Math.PI * 2);
    context.fill();
    return canvas.toDataURL("image/jpeg", 0.9).split(",")[1] ?? "";
  });
  const jpeg = Buffer.from(base64, "base64");
  return Buffer.concat([jpeg.subarray(0, 2), EXIF, jpeg.subarray(2)]);
}

/** Whether bytes still carry EXIF (or any metadata the server refuses). */
export function hasExif(bytes: Buffer): boolean {
  const view = new Uint8Array(bytes);
  const type = sniffPhotoType(view);
  return type !== null && hasPhotoMetadata(view, type);
}
