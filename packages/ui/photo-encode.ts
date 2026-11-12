import {
  CHAT_IMAGE_MAX_BYTES,
  CHAT_THUMB_STEPS,
  type ChatImageType,
  chatThumbVerdict,
} from "@domain/chat-files";
import {
  DOCUMENT_PHOTO_MAX_BYTES,
  DOCUMENT_PHOTO_STEPS,
  documentPhotoVerdict,
} from "@domain/documents";
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
 * 0.3 MB; a chat picture is drawn the same, with a 360 px thumbnail beside it
 * for the conversation; a photo of a page sent as an official document keeps
 * more of its pixels (1600 px), so its print stays legible. Browser only: it
 * needs a canvas.
 */

/**
 * What a photo picker offers: the types a phone's camera and photos give, so
 * an iPhone hands over its HEIC photos as JPEG.
 */
export const PICKED_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * A made-ready picture as a data URL, to show it before (and after) it is
 * sent: it goes with whatever holds it, where an object URL would stay until
 * revoked. Browser only.
 */
export function photoDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new PhotoReadError("unreadable"));
    reader.onerror = () => reject(new PhotoReadError("unreadable"));
    reader.readAsDataURL(blob);
  });
}

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
 * What is drawn, as `type` at `quality`, or null where the browser can't
 * write it (Safari writes no WebP: it gives a PNG instead). An encoder may
 * still write a block of its own into a JPEG: it is dropped, since the server
 * takes none.
 */
async function encodedAs(
  target: Canvas,
  type: ChatImageType,
  quality: number,
): Promise<Blob | null> {
  if (type === "image/webp") {
    const webp = await target.encode("image/webp", quality);
    return webp?.type === "image/webp" ? webp : null;
  }
  const jpeg = await target.encode("image/jpeg", quality + 0.01);
  return jpeg
    ? new Blob(
        [withoutJpegMetadata(new Uint8Array(await jpeg.arrayBuffer()))],
        { type: "image/jpeg" },
      )
    : null;
}

/**
 * What is drawn, as WebP, or JPEG where the browser can't write WebP (as
 * Safari can't), at `quality`.
 */
async function encoded(target: Canvas, quality: number): Promise<Blob | null> {
  return (
    (await encodedAs(target, "image/webp", quality)) ??
    (await encodedAs(target, "image/jpeg", quality))
  );
}

/** The picture drawn at most `longest` px on its longest side, keeping its shape. */
function drawn(picture: Picture, longest: number) {
  const { width, height } = fitWithin(picture.width, picture.height, longest);
  const target = blankCanvas(width, height);
  target.context.drawImage(picture.source, 0, 0, width, height);
  return { target, width, height };
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
    return (await fullPicture(picture)).blob;
  } finally {
    picture.close();
  }
}

/**
 * The whole picture, a list's photo's way: each of `LIST_PHOTO_STEPS` in
 * turn, smaller each time, until one is small enough (`listPhotoVerdict`);
 * "tooBig" when even the smallest is over 400 KB.
 */
async function fullPicture(
  picture: Picture,
): Promise<{ blob: Blob; width: number; height: number }> {
  if (picture.width < 1 || picture.height < 1) {
    throw new PhotoReadError("unreadable");
  }
  const tried: { blob: Blob; width: number; height: number }[] = [];
  for (const step of LIST_PHOTO_STEPS) {
    const { target, width, height } = drawn(picture, step.pixels);
    const blob = await encoded(target, step.quality);
    if (!blob) throw new PhotoReadError("unreadable");
    tried.push({ blob, width, height });
    const verdict = listPhotoVerdict(tried.map((each) => each.blob.size));
    if (verdict === "next") continue;
    if (verdict === "tooBig") break;
    const kept = tried[verdict.keep];
    if (kept) return kept;
  }
  throw new PhotoReadError("tooBig");
}

/** A chat picture as the app sends it: the picture, its thumbnail, and its size. */
export type ChatImageFiles = {
  /** At most 1280 px and 400 KB, about 0.3 MB. */
  full: Blob;
  /** At most 360 px and 48 KB, of the same type. */
  thumb: Blob;
  /** The full picture's size in pixels, for its place on screen while it goes. */
  width: number;
  height: number;
};

/**
 * A photo taken or picked for a chat message (C4 of the chat plan, §6.2),
 * decoded once, upright, and drawn twice: the whole picture as a list's photo
 * (its longest side at most 1280 px, aiming at 300 KB and never over 400 KB),
 * and a thumbnail of it for the conversation (`CHAT_THUMB_STEPS`: 360 px at
 * 0.6 first, at most 48 KB), in the picture's own type (WebP, or JPEG where
 * the browser can't write WebP), so the server takes the two together.
 * Drawing leaves behind everything the camera wrote into the file.
 */
export async function encodeChatImage(file: File): Promise<ChatImageFiles> {
  checkPicked(file);
  const picture = await decode(file);
  try {
    const full = await fullPicture(picture);
    if (full.blob.size > CHAT_IMAGE_MAX_BYTES) {
      throw new PhotoReadError("tooBig");
    }
    const type: ChatImageType =
      full.blob.type === "image/jpeg" ? "image/jpeg" : "image/webp";
    const thumbs: Blob[] = [];
    for (const step of CHAT_THUMB_STEPS) {
      const { target } = drawn(picture, step.pixels);
      const blob = await encodedAs(target, type, step.quality);
      if (!blob) throw new PhotoReadError("unreadable");
      thumbs.push(blob);
      const verdict = chatThumbVerdict(thumbs.map((each) => each.size));
      if (verdict === "next") continue;
      if (verdict === "tooBig") break;
      const thumb = thumbs[verdict.keep];
      if (thumb) {
        return {
          full: full.blob,
          thumb,
          width: full.width,
          height: full.height,
        };
      }
    }
    throw new PhotoReadError("tooBig");
  } finally {
    picture.close();
  }
}

/** A photo of a page as the app sends it as a document, and its size. */
export type DocumentPhotoFile = {
  /** At most 1600 px on its long side and 700 KB, about 500 KB. */
  blob: Blob;
  width: number;
  height: number;
};

/**
 * A photo of a page taken or picked for an official document (chat C7, plan
 * §6.2): upright, its whole picture, its long side at most 1600 px (about
 * 136 dpi for an A4 page), WebP (JPEG where the browser can't write WebP),
 * nothing from the camera, aiming at 500 KB and never over 700 KB, with no
 * thumbnail. Each of `DOCUMENT_PHOTO_STEPS` is tried in turn until one is
 * small enough (`documentPhotoVerdict`); "tooBig" when even the smallest is
 * over 700 KB.
 */
export async function encodeDocumentPhoto(
  file: File,
): Promise<DocumentPhotoFile> {
  checkPicked(file);
  const picture = await decode(file);
  try {
    if (picture.width < 1 || picture.height < 1) {
      throw new PhotoReadError("unreadable");
    }
    const tried: DocumentPhotoFile[] = [];
    for (const step of DOCUMENT_PHOTO_STEPS) {
      const { target, width, height } = drawn(picture, step.pixels);
      const blob = await encoded(target, step.quality);
      if (!blob) throw new PhotoReadError("unreadable");
      tried.push({ blob, width, height });
      const verdict = documentPhotoVerdict(tried.map((each) => each.blob.size));
      if (verdict === "next") continue;
      if (verdict === "tooBig") break;
      const kept = tried[verdict.keep];
      if (kept && kept.blob.size <= DOCUMENT_PHOTO_MAX_BYTES) return kept;
    }
    throw new PhotoReadError("tooBig");
  } finally {
    picture.close();
  }
}
