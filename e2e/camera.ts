import { expect, type Page } from "@playwright/test";

/**
 * A QR as the code screen draws it: its one SVG path and the side of its
 * viewBox (the quiet zone included).
 */
export type QrDrawing = { d: string; size: number };

/**
 * film: a camera that films a grey room, and whatever `film` holds up in front
 * of it. refused: the person said no, until `allowCamera` (as in the
 * browser's settings); then it films too. missing: a browser with no camera
 * API, as on a phone opening the app over plain http.
 */
export type CameraStandIn = "film" | "refused" | "missing";

/**
 * Stands in for the phone's camera from the page's first script on, because
 * CI has no camera: `getUserMedia` answers with a canvas's own stream
 * (`captureStream`), painted ten times a second. Every stream handed out is
 * kept, so a test can see whether the camera is still on (`liveCameraTracks`).
 * BarcodeDetector is removed, so the `qr` decoder an iPhone uses reads the
 * frames, whatever Chromium build runs. The QR is painted from the code
 * screen's path in plain black on white: drawing the SVG itself as an image
 * would lose its fills, which come from classes.
 */
export async function standInCamera(
  page: Page,
  mode: CameraStandIn,
): Promise<void> {
  await page.addInitScript((standIn: CameraStandIn) => {
    Reflect.deleteProperty(window, "BarcodeDetector");
    if (standIn === "missing") {
      Reflect.deleteProperty(Navigator.prototype, "mediaDevices");
      return;
    }
    const media = navigator.mediaDevices;
    const streams: MediaStream[] = [];
    Reflect.set(window, "cameraStreams", streams);
    Reflect.set(window, "cameraAllowed", standIn === "film");
    const side = 480;
    let canvas: HTMLCanvasElement | null = null;
    const paint = () => {
      const context = canvas?.getContext("2d");
      if (!context) return;
      context.fillStyle = "#6b6f78";
      context.fillRect(0, 0, side, side);
      const shown: { d: string; size: number } | null | undefined = Reflect.get(
        window,
        "filming",
      );
      if (!shown) return;
      // A screen held up to the camera: white, the code on it, a little apart.
      const box = side * 0.7;
      const at = (side - box) / 2;
      context.fillStyle = "#ffffff";
      context.fillRect(at, at, box, box);
      context.save();
      context.translate(at, at);
      context.scale(box / shown.size, box / shown.size);
      context.fillStyle = "#111214";
      context.fill(new Path2D(shown.d));
      context.restore();
    };
    media.getUserMedia = async () => {
      if (Reflect.get(window, "cameraAllowed") !== true) {
        throw new DOMException("Permission denied", "NotAllowedError");
      }
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.width = side;
        canvas.height = side;
        setInterval(paint, 100);
      }
      paint();
      const stream = canvas.captureStream(10);
      streams.push(stream);
      return stream;
    };
  }, mode);
}

/** Holds a code up to the stand-in camera, or takes it away (null). */
export async function film(page: Page, drawing: QrDrawing | null) {
  await page.evaluate((shown) => {
    Reflect.set(window, "filming", shown);
  }, drawing);
}

/** Allows the camera a "refused" stand-in refused, as the browser's settings would. */
export async function allowCamera(page: Page) {
  await page.evaluate(() => {
    Reflect.set(window, "cameraAllowed", true);
  });
}

/** How many of the stand-in camera's tracks are still on (none handed out: 0). */
export async function liveCameraTracks(page: Page): Promise<number> {
  return page.evaluate(() => {
    const streams: MediaStream[] = Reflect.get(window, "cameraStreams") ?? [];
    return streams
      .flatMap((stream) => stream.getTracks())
      .filter((track) => track.readyState === "live").length;
  });
}

/** The camera turns off: every track it handed out has ended. */
export async function expectCameraOff(page: Page) {
  await expect.poll(() => liveCameraTracks(page)).toBe(0);
}

/** The camera is on, once: one live track, every earlier one ended. */
export async function expectCameraOn(page: Page) {
  await expect.poll(() => liveCameraTracks(page)).toBe(1);
}

/**
 * The page as when the phone locks or another app comes in front (hidden), and
 * back (shown): what the page sees of it, `visibilityState` and its event.
 */
export async function setPageHidden(page: Page, hidden: boolean) {
  await page.evaluate((hide) => {
    if (hide) {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
      });
      Object.defineProperty(document, "hidden", {
        value: true,
        configurable: true,
      });
    } else {
      // The document's own getters again.
      Reflect.deleteProperty(document, "visibilityState");
      Reflect.deleteProperty(document, "hidden");
    }
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

/** The QR a page shows now, under its accessible name. */
export async function qrDrawing(page: Page, name: string): Promise<QrDrawing> {
  const svg = page.getByRole("img", { name }).first();
  await expect(svg).toBeVisible();
  const [viewBox, d] = await Promise.all([
    svg.getAttribute("viewBox"),
    svg.locator("path").getAttribute("d"),
  ]);
  const size = Number(viewBox?.split(" ")[2]);
  if (!d || !Number.isFinite(size) || size <= 0) {
    throw new Error(`No QR to film: viewBox ${viewBox}, path ${d}`);
  }
  return { d, size };
}
