import decodeQR from "qr/decode.js";

/*
 * Reading a QR code from a camera frame (`qr` 0.7.2, exactly), for phones
 * without a QR reader of their own: iPhones, and most computers. The worker's
 * clock loads this file only when its camera needs it (@ui/use-qr-camera), so
 * nobody downloads the decoder to press a circle. It imports the decoder and
 * nothing else: tooling/boundaries.test.ts keeps it that way.
 */

/** Raw RGBA pixels, as a canvas's `getImageData` gives them. */
export type QrImage = {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
};

/**
 * The text of a QR code in the picture, or null when this frame has none. The
 * decoder throws when it finds nothing, which for a camera is just a frame
 * missed; it keeps to about one frame's time budget either way.
 */
export function decodeQrImage(image: QrImage): string | null {
  try {
    return decodeQR(image);
  } catch {
    return null;
  }
}
