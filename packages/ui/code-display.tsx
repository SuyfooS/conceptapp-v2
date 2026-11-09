import { formatShortCode } from "@domain/punch-code-format";
import { cn } from "./cn";

/**
 * Six digits to read off a screen and type, in two groups of three, large and
 * left to right. A screen reader hears `spoken` instead, the whole sentence
 * the caller builds, so this joins no words of its own. Not a live region: a
 * code that changes every 20 seconds would otherwise be read out each time.
 */
export function CodeDisplay({
  digits,
  spoken,
  className,
}: {
  digits: string;
  /** The digits for a screen reader, one by one, in a sentence. */
  spoken: string;
  className?: string;
}) {
  return (
    <p className={cn("text-center", className)}>
      <span
        aria-hidden="true"
        dir="ltr"
        className="inline-block font-bold text-2xl tabular-nums leading-none tracking-[0.08em]"
      >
        {formatShortCode(digits)}
      </span>
      <span className="sr-only">{spoken}</span>
    </p>
  );
}
