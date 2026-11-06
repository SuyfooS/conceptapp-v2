import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

const RADIUS = 47;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export type PunchCircleProps = Omit<ComponentProps<"button">, "children"> & {
  /**
   * off: waiting for a touch. live: time is running. paused: on a break, drawn
   * without the business's colour so the two can't be mistaken at a glance.
   */
  tone: "off" | "live" | "paused";
  /** How far the ring has filled, 0 to 1. Null or left out: a closed ring. */
  progress?: number | null;
  /** What fills the middle: a large icon, or the time running. */
  figure: ReactNode;
  /** What pressing it does, with a verb. */
  label: ReactNode;
  loading?: boolean;
};

/** The big round button a person presses to start and end work. */
export function PunchCircle({
  tone,
  progress,
  figure,
  label,
  loading = false,
  disabled,
  className,
  type,
  ...props
}: PunchCircleProps) {
  const share = Math.min(1, Math.max(0, progress ?? 1));
  const paused = tone === "paused";
  return (
    <div
      className={cn(
        "relative mx-auto aspect-square w-full max-w-[280px]",
        className,
      )}
    >
      {paused ? null : (
        <div
          aria-hidden="true"
          className="absolute inset-[8%] translate-y-[6%] rounded-full bg-accent opacity-45 blur-2xl"
        />
      )}
      <button
        type={type ?? "button"}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          "pressable relative flex size-full select-none flex-col items-center justify-center gap-1 rounded-full text-center",
          "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4",
          "disabled:pointer-events-none aria-busy:cursor-progress",
          paused ? "bg-surface text-ink shadow-float" : "hero-surface",
          disabled && !loading ? "opacity-60" : null,
        )}
        {...props}
      >
        <svg
          viewBox="0 0 100 100"
          aria-hidden="true"
          className="absolute inset-[5%] size-[90%] -rotate-90"
        >
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="1.8"
            className={
              paused ? "stroke-surface-2" : "stroke-current opacity-25"
            }
          />
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeDasharray={`${share * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            className={cn(
              "transition-[stroke-dasharray] duration-200 ease-calm",
              paused ? "stroke-accent" : "stroke-current",
            )}
          />
        </svg>
        <span className="relative flex flex-col items-center gap-1">
          <span
            className={cn(
              "grid place-items-center font-bold text-2xl tabular-nums [&_svg]:size-20 [&_svg]:stroke-[1.25]",
              loading ? "opacity-60" : null,
            )}
          >
            {figure}
          </span>
          <span className="font-semibold text-md">{label}</span>
        </span>
      </button>
    </div>
  );
}
