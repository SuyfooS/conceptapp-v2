import type { ReactNode } from "react";
import { cn } from "./cn";

export type StatProps = {
  label: ReactNode;
  value: ReactNode;
  /** Context under the number, e.g. "מתוך 8" or "2 עדיין לא". */
  hint?: ReactNode;
  tone?: "neutral" | "warning";
  className?: string;
};

/** One number that answers a question at a glance. */
export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  className,
}: StatProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-card border border-line bg-surface p-4",
        className,
      )}
    >
      <span className="text-ink-2 text-sm">{label}</span>
      <span className="font-bold text-2xl leading-none">{value}</span>
      {hint ? (
        <span
          className={cn(
            "text-sm",
            tone === "warning" ? "text-warning" : "text-ink-2",
          )}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}
