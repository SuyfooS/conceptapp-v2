import { CameraOff, X } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { cn } from "./cn";
import { IconButton } from "./icon-button";
import { Spinner } from "./spinner";

/**
 * starting: the camera is opening (or being asked for). aiming: its picture
 * shows, inside a frame to aim with. reading: a code was taken and the picture
 * stands still while it is checked. read: it went through, and the business's
 * colour sweeps over the picture with `figure`. problem: no camera.
 */
export type ScanCircleState =
  | "starting"
  | "aiming"
  | "reading"
  | "read"
  | "problem";

/**
 * The punch circle turned into a camera: the same place and size, the business's
 * colour as a ring around a round picture, so scanning stays where the press
 * was. One line under it says what is happening, for everyone (a polite live
 * region); the picture itself is decoration. `still` stands in for the camera
 * where there is none to show, as in the gallery.
 */
export function ScanCircle({
  state,
  videoRef,
  frameRef,
  still,
  figure,
  status,
  cancel,
  className,
}: {
  state: ScanCircleState;
  /** The camera's `<video>`: muted, inline, never shown full screen. */
  videoRef?: Ref<HTMLVideoElement>;
  /** Where the picture freezes once a code is taken. */
  frameRef?: Ref<HTMLCanvasElement>;
  /** A picture instead of the camera (the gallery, the demo). */
  still?: ReactNode;
  /** In the middle when read (a check and the time), or for a problem. */
  figure?: ReactNode;
  /** What is happening now, in a sentence. */
  status: ReactNode;
  /**
   * Stops scanning: an icon button, so it needs its words. `autoFocus` puts
   * the focus there when the circle turns into the camera, since the button
   * that was pressed is gone.
   */
  cancel?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    autoFocus?: boolean;
  };
  className?: string;
}) {
  const showing = state === "aiming" || state === "reading" || state === "read";
  const stopped = state === "reading" || state === "read";
  return (
    <div className={cn("flex w-full flex-col items-center gap-3", className)}>
      <div className="relative mx-auto aspect-square w-full max-w-[280px]">
        <div
          aria-hidden="true"
          className="absolute inset-[8%] translate-y-[6%] rounded-full bg-accent opacity-45 blur-2xl"
        />
        <div className="hero-surface relative size-full rounded-full">
          <svg
            viewBox="0 0 100 100"
            aria-hidden="true"
            className="absolute inset-0 size-full -rotate-90"
          >
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              strokeWidth="1.6"
              className="stroke-current opacity-25"
            />
            {state === "read" ? (
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                strokeWidth="1.6"
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray="100"
                className="animate-[ring-sweep_600ms_var(--ease-calm)] stroke-current motion-reduce:animate-none"
              />
            ) : null}
          </svg>

          <div
            aria-hidden="true"
            className={cn(
              "absolute inset-[8%] overflow-hidden rounded-full",
              state === "problem" ? "bg-surface-2" : "bg-surface-3",
            )}
          >
            {still ? (
              <div
                className={cn(
                  "size-full transition-opacity duration-200",
                  showing ? null : "opacity-0",
                )}
              >
                {still}
              </div>
            ) : (
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                disablePictureInPicture
                className={cn(
                  "size-full object-cover transition-opacity duration-200",
                  state === "aiming" ? null : "opacity-0",
                )}
              />
            )}
            {frameRef ? (
              <canvas
                ref={frameRef}
                className={cn(
                  "absolute inset-0 size-full object-cover",
                  stopped ? null : "hidden",
                )}
              />
            ) : null}

            {state === "aiming" ? <AimFrame /> : null}
            {state === "reading" ? (
              <div className="absolute inset-0 grid place-items-center bg-qr-ink/35 text-qr-paper">
                <Spinner className="size-10" />
              </div>
            ) : null}
            {state === "read" ? (
              <div className="hero-surface absolute inset-0 animate-[fade-in_200ms] opacity-90 motion-reduce:animate-none" />
            ) : null}
            {state === "starting" ? (
              <div className="absolute inset-0 grid place-items-center text-ink-2">
                <Spinner className="size-10" />
              </div>
            ) : null}
            {/* Soft light on the lens, so it reads as glass over the picture. */}
            <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(70%_45%_at_32%_8%,var(--color-qr-paper),transparent_70%)] opacity-15" />
          </div>

          {state === "read" || state === "problem" ? (
            <div
              className={cn(
                "absolute inset-[8%] flex flex-col items-center justify-center gap-1 text-center",
                "font-bold text-2xl tabular-nums [&_svg]:size-16 [&_svg]:stroke-[1.5]",
                state === "problem" ? "text-ink-2" : null,
              )}
            >
              {figure ??
                (state === "problem" ? <CameraOff aria-hidden="true" /> : null)}
            </div>
          ) : null}
        </div>

        {cancel ? (
          <IconButton
            label={cancel.label}
            icon={<X aria-hidden="true" />}
            variant="secondary"
            disabled={cancel.disabled}
            autoFocus={cancel.autoFocus}
            onClick={cancel.onClick}
            className="absolute end-0 top-0 shadow-card"
          />
        ) : null}
      </div>

      <p
        aria-live="polite"
        className="min-h-12 max-w-[320px] text-balance text-center text-base text-ink"
      >
        {status}
      </p>
    </div>
  );
}

/** Four corners to aim the code into, light on any picture. */
function AimFrame() {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className="absolute inset-0 size-full stroke-qr-paper drop-shadow-sm"
      fill="none"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 34V26a4 4 0 0 1 4-4h8M66 22h8a4 4 0 0 1 4 4v8M78 66v8a4 4 0 0 1-4 4h-8M34 78h-8a4 4 0 0 1-4-4v-8" />
    </svg>
  );
}
