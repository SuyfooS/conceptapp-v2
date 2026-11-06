import { cn } from "./cn";

const RADIUS = 18;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * How much of something is done, at a glance. Decoration: the words next to it
 * say the same, so it is hidden from screen readers.
 */
export function ProgressRing({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
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
        className="stroke-surface-2"
      />
      <circle
        cx="22"
        cy="22"
        r={RADIUS}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${share * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
        className="stroke-accent"
      />
    </svg>
  );
}
