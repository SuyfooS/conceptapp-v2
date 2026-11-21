import type { ReactNode } from "react";
import { cn } from "./cn";

export type StationBannerProps = {
  /**
   * `danger`: what stops the screen doing its job (no connection), said at
   * once. `warning`: what a tap puts right (the sound stopped), the whole
   * banner its button.
   */
  tone: "danger" | "warning";
  icon: ReactNode;
  /** Large: read from across a kitchen. */
  title: string;
  /** A line under it, smaller. */
  body?: string;
  /** For `warning`: the banner is one button that does it. */
  onClick?: () => void;
};

/**
 * A banner across a station's screen (waiter mode P8a), full width at the
 * top: large enough to read from a step away, in words as well as colour.
 * Danger is read out as it shows. Warning with a tap is one button at least
 * 64px tall.
 */
export function StationBanner({
  tone,
  icon,
  title,
  body,
  onClick,
}: StationBannerProps) {
  const content = (
    <>
      <span aria-hidden="true" className="mt-0.5 shrink-0 [&_svg]:size-6">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold text-lg">{title}</span>
        {body ? (
          <span
            className={cn(
              "text-base",
              tone === "danger" ? "text-danger-ink" : "text-ink-2",
            )}
          >
            {body}
          </span>
        ) : null}
      </span>
    </>
  );
  if (tone === "warning" && onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="pressable flex min-h-16 w-full cursor-pointer items-start gap-3 rounded-card bg-warning-soft px-5 py-4 text-start text-ink focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      >
        {content}
      </button>
    );
  }
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex w-full items-start gap-3 rounded-card px-5 py-4",
        tone === "danger"
          ? "bg-danger text-danger-ink"
          : "bg-warning-soft text-ink",
      )}
    >
      {content}
    </div>
  );
}
