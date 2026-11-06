import { cn } from "./cn";

/** Past this many places, one continuous track reads better than segments. */
const MAX_SEGMENTS = 12;

export type CoverageBarProps = {
  /** People placed so far. More than `total` shows as full. */
  filled: number;
  /** People needed: one segment each. */
  total: number;
  className?: string;
};

/**
 * How full a shift is, one segment per person it needs. Decoration only: the
 * text beside it says the same in words.
 */
export function CoverageBar({ filled, total, className }: CoverageBarProps) {
  const on = Math.min(filled, total);
  return (
    <span aria-hidden="true" className={cn("flex gap-1", className)}>
      {total > MAX_SEGMENTS ? (
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          <span
            className="block h-full rounded-full bg-accent transition-[width] duration-200"
            style={{ width: `${(on / total) * 100}%` }}
          />
        </span>
      ) : (
        Array.from({ length: total }, (_, i) => (
          <span
            // The segments have no identity beyond their place in the row.
            key={i.toString()}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-200",
              i < on ? "bg-accent" : "bg-surface-2",
            )}
          />
        ))
      )}
    </span>
  );
}
