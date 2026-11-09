import {
  PICKED_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_PIXELS,
  PROFILE_PHOTO_QUALITY,
  squareCrop,
  withoutJpegMetadata,
} from "@domain/profile-photos";

/*
 * A picked photo as the app stores it, made in the browser: decoded upright,
 * cropped to its centred square, drawn at 512 px and encoded again. Drawing
 * leaves behind everything the camera wrote into the file (where and when it
 * was taken, the phone), and a phone's 4 MB photo becomes 20 to 80 KB.
 * Browser only: it needs a canvas.
 */

/** Why a picked file can't become a photo. */
export class PhotoReadError extends Error {
  readonly problem: "unreadable" | "tooBig";

  constructor(problem: "unreadable" | "tooBig") {
    super(problem);
    this.name = "PhotoReadError";
    this.problem = problem;
  }
}

type Picture = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

/** The file as a picture, upright as the camera held it. */
async function decode(file: File): Promise<Picture> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  } catch {
    // Some browsers decode a type only through an image element.
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new PhotoReadError("unreadable");
  }
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    close: () => URL.revokeObjectURL(url),
  };
}

type Canvas = {
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  encode: (type: string, quality: number) => Promise<Blob | null>;
};

function canvas(side: number): Canvas | null {
  if (typeof OffscreenCanvas !== "undefined") {
    const offscreen = new OffscreenCanvas(side, side);
    const context = offscreen.getContext("2d");
    if (context) {
      return {
        context,
        encode: (type, quality) =>
          offscreen.convertToBlob({ type, quality }).catch(() => null),
      };
    }
  }
  const element = document.createElement("canvas");
  element.width = side;
  element.height = side;
  const context = element.getContext("2d");
  if (!context) return null;
  return {
    context,
    encode: (type, quality) =>
      new Promise((resolve) => element.toBlob(resolve, type, quality)),
  };
}

/**
 * A picked file as the app stores it: a centred square, 512 px, WebP (JPEG
 * where the browser can't write WebP, as Safari can't), nothing from the camera.
 */
export async function encodeProfilePhoto(file: File): Promise<Blob> {
  if (file.size > PICKED_PHOTO_MAX_BYTES) throw new PhotoReadError("tooBig");
  const picture = await decode(file);
  try {
    if (picture.width < 1 || picture.height < 1) {
      throw new PhotoReadError("unreadable");
    }
    const side = PROFILE_PHOTO_PIXELS;
    const target = canvas(side);
    if (!target) throw new PhotoReadError("unreadable");
    const { sx, sy, size } = squareCrop(picture.width, picture.height);
    const { context } = target;
    // A transparent picture gets a white ground, as JPEG would give it anyway.
    context.fillStyle = "white";
    context.fillRect(0, 0, side, side);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(picture.source, sx, sy, size, size, 0, 0, side, side);

    let blob = await target.encode("image/webp", PROFILE_PHOTO_QUALITY);
    if (blob?.type !== "image/webp") {
      const jpeg = await target.encode(
        "image/jpeg",
        PROFILE_PHOTO_QUALITY + 0.01,
      );
      // An encoder may still write a block of its own: the server takes none.
      blob = jpeg
        ? new Blob(
            [withoutJpegMetadata(new Uint8Array(await jpeg.arrayBuffer()))],
            { type: "image/jpeg" },
          )
        : null;
    }
    if (!blob) throw new PhotoReadError("unreadable");
    if (blob.size > PROFILE_PHOTO_MAX_BYTES) throw new PhotoReadError("tooBig");
    return blob;
  } finally {
    picture.close();
  }
}
