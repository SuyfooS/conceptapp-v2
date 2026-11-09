/*
 * The camera's side of scanning a QR code, kept apart from React so it can be
 * tested on its own: what to ask the camera for, which reader to use, why a
 * camera didn't open, and which part of a frame to read. use-qr-camera.ts runs
 * the camera with these.
 */

/**
 * The phone's back camera where there is one (a computer's webcam otherwise),
 * at a size a QR a hand's length away reads well from, without the battery
 * cost of full HD. No sound, ever.
 */
export const CAMERA_CONSTRAINTS = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
} as const satisfies MediaStreamConstraints;

/** About 8 reads a second: quick to catch a code, light on the battery. */
export const SCAN_INTERVAL_MS = 125;

/** The longest side of what is read from each frame, in pixels. */
export const SCAN_CROP_MAX = 480;

/**
 * How long the decoder's download, and then the camera's first picture, may
 * take. Past it the camera is off and typing the digits is the way on, rather
 * than a spinner with no end (a phone with no signal, a stuck camera).
 */
export const START_WAIT_MS = 15_000;

/** `promise`, or a rejection once `ms` go by without an answer. */
export function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const late = setTimeout(
      () => reject(new Error(`No answer in ${ms} ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(late);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(late);
        reject(error);
      },
    );
  });
}

/**
 * An iPhone's (or iPad's) home-screen app, which Safari marks with
 * `navigator.standalone`. It asks about the camera again each time it starts,
 * and has no browser settings to allow the camera in.
 */
export function isAppleHomeScreenApp(globals: object): boolean {
  const nav: unknown = Reflect.get(globals, "navigator");
  return (
    typeof nav === "object" &&
    nav !== null &&
    Reflect.get(nav, "standalone") === true
  );
}

/** One code a reader found. */
export type DetectedCode = { rawValue: string };

/**
 * The part of the Shape Detection API used here. TypeScript's DOM library has
 * no BarcodeDetector yet, so it is declared here and read from the globals
 * through `barcodeDetectorOf`, never assumed.
 */
export type BarcodeDetectorLike = {
  detect(source: HTMLCanvasElement): Promise<DetectedCode[]>;
};
export type BarcodeDetectorClass = {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
};

function isDetectorClass(value: unknown): value is BarcodeDetectorClass {
  return (
    typeof value === "function" &&
    "getSupportedFormats" in value &&
    typeof value.getSupportedFormats === "function"
  );
}

/** The browser's own BarcodeDetector, when it has one. */
export function barcodeDetectorOf(
  globals: object,
): BarcodeDetectorClass | null {
  const value: unknown = Reflect.get(globals, "BarcodeDetector");
  return isDetectorClass(value) ? value : null;
}

/**
 * native: the phone's own reader (Android's Chrome, a Mac), only when it says
 * it reads QR codes; some list the class and support no format at all. js: the
 * `qr` decoder (@domain/qr-decode), as on an iPhone.
 */
export async function pickReader(globals: object): Promise<"native" | "js"> {
  const Detector = barcodeDetectorOf(globals);
  if (!Detector) return "js";
  try {
    const formats = await Detector.getSupportedFormats();
    return formats.includes("qr_code") ? "native" : "js";
  } catch {
    return "js";
  }
}

/** Why the camera didn't open. */
export type CameraProblem = "denied" | "unavailable";

/**
 * denied: the person or the browser said no (NotAllowedError, and SecurityError
 * where the page may not ask, as on a phone opening plain http). unavailable:
 * anything else, such as no camera, one another app holds, or a browser with
 * no camera API at all.
 */
export function cameraProblemOf(error: unknown): CameraProblem {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? error.name
      : null;
  return name === "NotAllowedError" ||
    name === "SecurityError" ||
    name === "PermissionDeniedError"
    ? "denied"
    : "unavailable";
}

/**
 * The middle square of a frame, which is what the round picture shows, and
 * the size to read it at: the square itself, or `max` pixels when it is
 * larger. Whole pixels.
 */
export function cropOf(
  width: number,
  height: number,
  max = SCAN_CROP_MAX,
): { x: number; y: number; side: number; size: number } {
  const side = Math.min(width, height);
  return {
    x: Math.floor((width - side) / 2),
    y: Math.floor((height - side) / 2),
    side,
    size: Math.min(side, max),
  };
}
