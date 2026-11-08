import { cn } from "./cn";

const RADIUS = 18;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const TONES = {
  /** On the app's own surfaces, following the device's appearance. */
  surface: { track: "stroke-surface-2", fill: "stroke-accent" },
  /**
   * On the QR's paper, white in every appearance: a faint ink track and the
   * accent's light-mode colour, which stays readable on white.
   */
  paper: {
    track: "stroke-qr-ink/10",
    fill: "stroke-[var(--accent-light,var(--accent))]",
  },
} as const;

/**
 * How much of something is done, at a glance. Decoration: the words next to it
 * say the same, so it is hidden from screen readers.
 */
export function ProgressRing({
  value,
  max,
  tone = "surface",
  className,
}: {
  value: number;
  max: number;
  /** What it sits on: the app's surfaces, or the QR's white paper. */
  tone?: keyof typeof TONES;
  className?: string;
}) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const colours = TONES[tone];
  return (
    <svg
      viewBox="0 0 44 44"
      aria-hidden="true"
      className={cn("size-11 shrink-0 -rotate-90", className)}
    >
      <circle
        cx="22"
        cy="22"
        r={RADIUS}
        fill="none"
        strokeWidth="5"
        className={colours.track}
      />
      <circle
        cx="22"
        cy="22"
        r={RADIUS}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${share * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
        className={colours.fill}
      />
    </svg>
  );
}
