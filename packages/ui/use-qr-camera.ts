"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import {
  barcodeDetectorOf,
  CAMERA_CONSTRAINTS,
  type CameraProblem,
  cameraProblemOf,
  cropOf,
  pickReader,
  SCAN_INTERVAL_MS,
  START_WAIT_MS,
  within,
} from "./qr-camera";

/**
 * idle: off. asking: the browser is asking the person about the camera.
 * starting: the camera is opening. aiming: it shows, and frames are read.
 * frozen: a code was taken; the camera is off and its last picture stays.
 * denied / unavailable: it didn't open (cameraProblemOf).
 */
export type QrCameraState =
  | "idle"
  | "asking"
  | "starting"
  | "aiming"
  | "frozen"
  | "denied"
  | "unavailable";

/** What to do after a code was read: read on, or keep this one and stop. */
export type QrTextAnswer = "keep" | "stop";

/** Reads the codes in the crop just drawn on `canvas`. */
type Reader = (
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
) => Promise<string[]>;

type JsReader = typeof import("@domain/qr-decode");

let jsReader: Promise<JsReader> | null = null;

/** The `qr` decoder, downloaded once, and again after a failed try. */
function loadJsReader(): Promise<JsReader> {
  jsReader ??= import("@domain/qr-decode").catch((error: unknown) => {
    jsReader = null;
    throw error;
  });
  return jsReader;
}

/**
 * Starts downloading the decoder before anyone presses, for a phone without a
 * reader of its own; one with a reader downloads nothing.
 */
export function preloadQrReader(): void {
  void pickReader(globalThis)
    .then((reader) => (reader === "js" ? loadJsReader() : undefined))
    .catch(() => {});
}

async function makeReader(): Promise<Reader> {
  const Detector =
    (await pickReader(globalThis)) === "native"
      ? barcodeDetectorOf(globalThis)
      : null;
  const readJs: Reader = async (canvas, context) => {
    const { decodeQrImage } = await loadJsReader();
    const text = decodeQrImage(
      context.getImageData(0, 0, canvas.width, canvas.height),
    );
    return text === null ? [] : [text];
  };
  if (!Detector) {
    await loadJsReader();
    return readJs;
  }
  const detector = new Detector({ formats: ["qr_code"] });
  // A phone's reader that fails once is left for the decoder from then on.
  let broken = false;
  return async (canvas, context) => {
    if (!broken) {
      try {
        return (await detector.detect(canvas)).map((found) => found.rawValue);
      } catch {
        broken = true;
      }
    }
    return readJs(canvas, context);
  };
}

/** What the browser says about the camera, where it says anything. */
async function cameraPermission(): Promise<PermissionStatus | null> {
  try {
    return await navigator.permissions.query({
      // Browsers know "camera"; TypeScript's PermissionName list doesn't yet.
      name: "camera" as string as PermissionName,
    });
  } catch {
    return null;
  }
}

/**
 * The camera for reading a QR code, inside the page: the back camera into
 * `videoRef` (a `<video playsInline muted>`), the middle square of a frame
 * read about 8 times a second, by the phone's own reader where it has one and
 * by the `qr` decoder otherwise, each code handed to `onText`. On "stop", the
 * picture freezes (drawn into `frameRef`), the camera turns off and the phone
 * buzzes once where it can; `restart` opens it again.
 *
 * The camera is on only while it can be useful: while `active`, and the page
 * shows. It opens only once a reader is there to read it, and a reader or a
 * picture that doesn't come within START_WAIT_MS says unavailable. Hidden, it
 * turns off, and it opens again when the page shows. A camera that didn't
 * open tries again then too (back from the phone's settings), and when the
 * browser says it is allowed now (Chrome's own site settings, which don't
 * hide the page); `restart` tries at once. An iPhone's home-screen app asks
 * about the camera again each time the app starts, and its camera stops
 * whenever the app goes to the background: both come through as the states
 * above, so the screen says what is happening.
 */
export function useQrCamera({
  active,
  onText,
}: {
  active: boolean;
  onText: (text: string) => QrTextAnswer;
}): {
  videoRef: RefObject<HTMLVideoElement | null>;
  frameRef: RefObject<HTMLCanvasElement | null>;
  state: QrCameraState;
  restart: () => void;
} {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<QrCameraState>("idle");
  const [run, setRun] = useState(0);
  const latestOnText = useRef(onText);
  useEffect(() => {
    latestOnText.current = onText;
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: run is what restarts the camera
  useEffect(() => {
    if (!active) return;
    const canvas = document.createElement("canvas");
    // Sized by the first frame, both sides: a new canvas is 300 by 150.
    canvas.width = 0;
    canvas.height = 0;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const reader = makeReader();
    // Unhandled until the camera waits for it; a failure there says unavailable.
    reader.catch(() => {});

    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    /** Bumped whenever the camera turns off, so work for an older one stops. */
    let session = 0;
    /** A code was kept: nothing to open again. */
    let kept = false;
    /**
     * Why the camera didn't open, if it didn't. Unlike a kept code, it tries
     * again when the page shows again, and when the browser allows it.
     */
    let problem: CameraProblem | null = null;
    /** Turned off because the page was hidden, to open again when it shows. */
    let away = false;
    /** The effect is over: an answer coming in now is for nobody. */
    let over = false;
    let permission: PermissionStatus | null = null;

    function off() {
      session += 1;
      clearTimeout(timer);
      for (const track of stream?.getTracks() ?? []) track.stop();
      stream = null;
      const video = videoRef.current;
      if (video) video.srcObject = null;
    }

    function giveUp(why: CameraProblem) {
      off();
      problem = why;
      setState(why);
    }

    async function open() {
      off();
      problem = null;
      const mine = session;
      const devices = navigator.mediaDevices;
      if (!context || typeof devices?.getUserMedia !== "function") {
        giveUp("unavailable");
        return;
      }
      setState("starting");

      // The camera opens only once something can read it: never a camera on
      // while the decoder still downloads.
      let read: Reader;
      try {
        read = await within(reader, START_WAIT_MS);
      } catch {
        if (mine === session) giveUp("unavailable");
        return;
      }
      if (mine !== session) return;

      void cameraPermission().then((status) => {
        if (status?.state === "prompt" && mine === session && stream === null) {
          setState("asking");
        }
      });
      let opened: MediaStream;
      try {
        opened = await devices.getUserMedia(CAMERA_CONSTRAINTS);
      } catch (error) {
        if (mine === session) giveUp(cameraProblemOf(error));
        return;
      }
      if (mine !== session) {
        for (const track of opened.getTracks()) track.stop();
        return;
      }
      stream = opened;
      // Allowed: the screen no longer says to allow it.
      setState("starting");
      for (const track of opened.getVideoTracks()) {
        // Taken by another app, or unplugged.
        track.addEventListener("ended", () => {
          if (mine === session) giveUp("unavailable");
        });
      }

      const video = videoRef.current;
      if (!video) {
        giveUp("unavailable");
        return;
      }
      // An iPhone plays a video full screen unless told otherwise.
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.srcObject = opened;
      try {
        await within(video.play(), START_WAIT_MS);
      } catch {
        if (mine === session) giveUp("unavailable");
        return;
      }
      if (mine !== session) return;
      setState("aiming");
      next(mine, video, read);
    }

    function next(mine: number, video: HTMLVideoElement, read: Reader) {
      if (mine !== session) return;
      timer = setTimeout(() => void look(mine, video, read), SCAN_INTERVAL_MS);
    }

    /**
     * Reads the frame showing now. A timer rather than a frame callback: at 8
     * reads a second from a camera's 30 frames each read is a new frame anyway,
     * and a timer doesn't stall where a browser stops presenting frames.
     */
    async function look(mine: number, video: HTMLVideoElement, read: Reader) {
      if (mine !== session || !context) return;
      if (
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        const crop = cropOf(video.videoWidth, video.videoHeight);
        if (canvas.width !== crop.size || canvas.height !== crop.size) {
          canvas.width = crop.size;
          canvas.height = crop.size;
        }
        context.drawImage(
          video,
          crop.x,
          crop.y,
          crop.side,
          crop.side,
          0,
          0,
          crop.size,
          crop.size,
        );
        let texts: string[] = [];
        try {
          texts = await read(canvas, context);
        } catch {
          texts = [];
        }
        if (mine !== session) return;
        for (const text of texts) {
          if (latestOnText.current(text) === "stop") {
            freeze(video);
            return;
          }
        }
      }
      next(mine, video, read);
    }

    function freeze(video: HTMLVideoElement) {
      const still = frameRef.current;
      if (still) {
        still.width = canvas.width;
        still.height = canvas.height;
        still.getContext("2d")?.drawImage(canvas, 0, 0);
      }
      video.pause();
      off();
      kept = true;
      navigator.vibrate?.(30);
      setState("frozen");
    }

    // A camera that didn't open is off already; hiding still marks it away,
    // so showing again (back from the settings) tries once more.
    function onHide() {
      if (kept || away) return;
      away = true;
      off();
    }
    function onShow() {
      if (!away) return;
      away = false;
      void open();
    }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") onHide();
      else onShow();
    }
    function onPageShow() {
      if (document.visibilityState === "visible") onShow();
    }
    // Allowed where the page stays in view, as in Chrome's own site settings.
    function onPermissionChange() {
      if (problem === "denied" && !away && permission?.state === "granted") {
        void open();
      }
    }

    if (document.visibilityState === "hidden") away = true;
    else void open();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onPageShow);
    void cameraPermission().then((status) => {
      if (over || !status) return;
      permission = status;
      status.addEventListener("change", onPermissionChange);
    });
    return () => {
      over = true;
      off();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onPageShow);
      permission?.removeEventListener("change", onPermissionChange);
      setState("idle");
    };
  }, [active, run]);

  return {
    videoRef,
    frameRef,
    state: active ? state : "idle",
    restart: () => setRun((n) => n + 1),
  };
}
