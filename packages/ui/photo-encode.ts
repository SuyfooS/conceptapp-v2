import {
  fitWithin,
  LIST_PHOTO_STEPS,
  listPhotoVerdict,
} from "@domain/list-photos";
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
 * drawn again and encoded again. Drawing leaves behind everything the camera
 * wrote into the file (where and when it was taken, the phone). A profile
 * photo is its centred square at 512 px, 20 to 80 KB from a phone's 4 MB; a
 * list's photo keeps its shape, its longest side at most 1280 px, about
 * 0.3 MB. Browser only: it needs a canvas.
 */

/** Why a picked file can't become a photo. */
export class PhotoReadError extends Error {
  readonly problem: "unreadable" | "tooBig" | "type";

  constructor(problem: "unreadable" | "tooBig" | "type") {
    super(problem);
    this.name = "PhotoReadError";
    this.problem = problem;
  }
}

/**
 * A picked file a photo can come from: an image, or a type the phone didn't
 * say. One over 25 MB is "tooBig" before it is decoded, as one still too big
 * once encoded: the screens' words for it hold for both.
 */
function checkPicked(file: File) {
  if (file.type !== "" && !file.type.startsWith("image/")) {
    throw new PhotoReadError("type");
  }
  if (file.size > PICKED_PHOTO_MAX_BYTES) throw new PhotoReadError("tooBig");
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

function canvas(width: number, height: number): Canvas | null {
  if (typeof OffscreenCanvas !== "undefined") {
    const offscreen = new OffscreenCanvas(width, height);
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
  element.width = width;
  element.height = height;
  const context = element.getContext("2d");
  if (!context) return null;
  return {
    context,
    encode: (type, quality) =>
      new Promise((resolve) => element.toBlob(resolve, type, quality)),
  };
}

/**
 * A canvas ready to draw on: a transparent picture gets a white ground, as
 * JPEG would give it anyway, and the picture is smoothed as it shrinks.
 */
function blankCanvas(width: number, height: number): Canvas {
  const target = canvas(width, height);
  if (!target) throw new PhotoReadError("unreadable");
  const { context } = target;
  context.fillStyle = "white";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return target;
}

/**
 * What is drawn, as WebP, or JPEG where the browser can't write WebP (as
 * Safari can't), at `quality`. An encoder may still write a block of its own
 * into a JPEG: it is dropped, since the server takes none.
 */
async function encoded(target: Canvas, quality: number): Promise<Blob | null> {
  const webp = await target.encode("image/webp", quality);
  if (webp?.type === "image/webp") return webp;
  const jpeg = await target.encode("image/jpeg", quality + 0.01);
  return jpeg
    ? new Blob(
        [withoutJpegMetadata(new Uint8Array(await jpeg.arrayBuffer()))],
        { type: "image/jpeg" },
      )
    : null;
}

/**
 * A picked file as the app stores it: a centred square, 512 px, WebP (JPEG
 * where the browser can't write WebP, as Safari can't), nothing from the camera.
 */
export async function encodeProfilePhoto(file: File): Promise<Blob> {
  checkPicked(file);
  const picture = await decode(file);
  try {
    if (picture.width < 1 || picture.height < 1) {
      throw new PhotoReadError("unreadable");
    }
    const side = PROFILE_PHOTO_PIXELS;
    const target = blankCanvas(side, side);
    const { sx, sy, size } = squareCrop(picture.width, picture.height);
    target.context.drawImage(
      picture.source,
      sx,
      sy,
      size,
      size,
      0,
      0,
      side,
      side,
    );
    const blob = await encoded(target, PROFILE_PHOTO_QUALITY);
    if (!blob) throw new PhotoReadError("unreadable");
    if (blob.size > PROFILE_PHOTO_MAX_BYTES) throw new PhotoReadError("tooBig");
    return blob;
  } finally {
    picture.close();
  }
}

/**
 * A photo taken or picked for a list, as the app stores it: upright, its
 * whole picture (no crop), its longest side at most 1280 px, WebP (JPEG where
 * the browser can't write WebP), nothing from the camera, about 0.3 MB. Each
 * of `LIST_PHOTO_STEPS` is tried in turn, smaller each time, until one is
 * small enough (`listPhotoVerdict`); a picture still over 400 KB at the end
 * is "tooBig".
 */
export async function encodeListPhoto(file: File): Promise<Blob> {
  checkPicked(file);
  const picture = await decode(file);
  try {
    if (picture.width < 1 || picture.height < 1) {
      throw new PhotoReadError("unreadable");
    }
    const tried: Blob[] = [];
    for (const step of LIST_PHOTO_STEPS) {
      const { width, height } = fitWithin(
        picture.width,
        picture.height,
        step.pixels,
      );
      const target = blankCanvas(width, height);
      target.context.drawImage(picture.source, 0, 0, width, height);
      const blob = await encoded(target, step.quality);
      if (!blob) throw new PhotoReadError("unreadable");
      tried.push(blob);
      const verdict = listPhotoVerdict(tried.map((each) => each.size));
      if (verdict === "next") continue;
      if (verdict === "tooBig") break;
      const kept = tried[verdict.keep];
      if (kept) return kept;
    }
    throw new PhotoReadError("tooBig");
  } finally {
    picture.close();
  }
}
