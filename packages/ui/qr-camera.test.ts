import { afterEach, describe, expect, it, vi } from "vitest";
import {
  barcodeDetectorOf,
  CAMERA_CONSTRAINTS,
  cameraProblemOf,
  cropOf,
  isAppleHomeScreenApp,
  pickReader,
  within,
} from "./qr-camera";

/** A stand-in for the browser's BarcodeDetector that reads these formats. */
function detectorReading(formats: string[] | Error) {
  return class {
    static async getSupportedFormats(): Promise<string[]> {
      if (formats instanceof Error) throw formats;
      return formats;
    }
    async detect() {
      return [];
    }
  };
}

describe("pickReader", () => {
  it("uses the phone's own reader only when it reads QR codes", async () => {
    expect(
      await pickReader({
        BarcodeDetector: detectorReading(["ean_13", "qr_code"]),
      }),
    ).toBe("native");
    expect(
      await pickReader({ BarcodeDetector: detectorReading(["ean_13"]) }),
    ).toBe("js");
    expect(await pickReader({ BarcodeDetector: detectorReading([]) })).toBe(
      "js",
    );
    expect(
      await pickReader({
        BarcodeDetector: detectorReading(new Error("not today")),
      }),
    ).toBe("js");
    expect(await pickReader({})).toBe("js");
  });

  it("takes only something shaped like a detector", () => {
    expect(barcodeDetectorOf({ BarcodeDetector: {} })).toBe(null);
    expect(barcodeDetectorOf({ BarcodeDetector: () => [] })).toBe(null);
    expect(barcodeDetectorOf({ BarcodeDetector: undefined })).toBe(null);
    const Detector = detectorReading(["qr_code"]);
    expect(barcodeDetectorOf({ BarcodeDetector: Detector })).toBe(Detector);
  });
});

describe("cameraProblemOf", () => {
  it("says why the camera didn't open", () => {
    const named = (name: string) => new DOMException("", name);
    expect(cameraProblemOf(named("NotAllowedError"))).toBe("denied");
    expect(cameraProblemOf(named("SecurityError"))).toBe("denied");
    expect(cameraProblemOf(named("PermissionDeniedError"))).toBe("denied");
    for (const name of [
      "NotFoundError",
      "NotReadableError",
      "OverconstrainedError",
      "AbortError",
    ]) {
      expect(cameraProblemOf(named(name)), name).toBe("unavailable");
    }
    // No camera API at all (`navigator.mediaDevices` missing), or nothing said.
    expect(cameraProblemOf(new TypeError("undefined is not a function"))).toBe(
      "unavailable",
    );
    expect(cameraProblemOf(undefined)).toBe("unavailable");
    expect(cameraProblemOf("NotAllowedError")).toBe("unavailable");
  });
});

describe("cropOf", () => {
  it("crops the middle square, at most 480 pixels", () => {
    expect(cropOf(1280, 720)).toEqual({ x: 280, y: 0, side: 720, size: 480 });
    // A phone held upright gives a tall frame.
    expect(cropOf(720, 1280)).toEqual({ x: 0, y: 280, side: 720, size: 480 });
    expect(cropOf(640, 480)).toEqual({ x: 80, y: 0, side: 480, size: 480 });
    expect(cropOf(401, 300)).toEqual({ x: 50, y: 0, side: 300, size: 300 });
    expect(cropOf(1920, 1080, 640)).toEqual({
      x: 420,
      y: 0,
      side: 1080,
      size: 640,
    });
  });
});

describe("within", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes an answer in time on, and gives up on one that doesn't come", async () => {
    vi.useFakeTimers();
    await expect(within(Promise.resolve("read"), 1000)).resolves.toBe("read");
    const failed = new Error("no signal");
    await expect(within(Promise.reject(failed), 1000)).rejects.toBe(failed);

    const never = within(new Promise<string>(() => {}), 1000);
    const outcome = never.then(
      () => "answered",
      () => "gave up",
    );
    await vi.advanceTimersByTimeAsync(999);
    let settled = false;
    void outcome.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toBe("gave up");
  });
});

describe("isAppleHomeScreenApp", () => {
  it("knows an iPhone's home-screen app by navigator.standalone", () => {
    expect(isAppleHomeScreenApp({ navigator: { standalone: true } })).toBe(
      true,
    );
    expect(isAppleHomeScreenApp({ navigator: { standalone: false } })).toBe(
      false,
    );
    // Android's installed apps and every other browser have no such flag.
    expect(isAppleHomeScreenApp({ navigator: {} })).toBe(false);
    expect(isAppleHomeScreenApp({ navigator: null })).toBe(false);
    expect(isAppleHomeScreenApp({})).toBe(false);
  });
});

describe("CAMERA_CONSTRAINTS", () => {
  it("asks for the back camera, and no sound", () => {
    expect(CAMERA_CONSTRAINTS.audio).toBe(false);
    expect(CAMERA_CONSTRAINTS.video.facingMode).toEqual({
      ideal: "environment",
    });
  });
});
