import { cn } from "./cn";

/**
 * Where a person is in a flow of a few steps (the hiring file's, H5a): "צעד
 * 2 מתוך 6" in words, and a segment per step under it, those behind filled,
 * the current one wider. Not @ui/stepper, which counts up and down. The
 * words are the caller's, so either language reads right; the segments only
 * repeat them, for the eye, and screen readers hear the words alone. Only the current segment's change moves, and
 * not at all with reduced motion.
 */
export function Steps({
  count,
  current,
  label,
  className,
}: {
  count: number;
  /** 1 to `count`. */
  current: number;
  /** "צעד 2 מתוך 6". */
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="font-medium text-ink-2 text-sm">{label}</p>
      <div aria-hidden="true" className="flex gap-1">
        {Array.from({ length: count }, (_, i) => i + 1).map((step) => {
          return (
            <span
              key={step}
              className={cn(
                "h-1.5 rounded-full transition-[flex-grow,background-color] duration-200 ease-calm motion-reduce:transition-none",
                step < current
                  ? "flex-1 bg-accent/55"
                  : step === current
                    ? "flex-[2] bg-accent"
                    : "flex-1 bg-surface-3",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
