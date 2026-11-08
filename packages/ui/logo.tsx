import { cn } from "./cn";
import { LOCKUP, MARK } from "./logo-paths";

/**
 * ConceptApp's own logo (Orel, 8 November 2026): the mark, a C in front of a
 * card, then the wordmark. It is ConceptApp's colour, so it belongs where
 * ConceptApp itself speaks (sign-in, the console, marketing), never inside a
 * business's screens. The wordmark takes the text colour, so it reads in light
 * and dark. Size it by height (`h-7` is the default); the width follows.
 */
export function Logo({
  label,
  className,
}: {
  /** The name read out by screen readers: the `brand` message. */
  label: string;
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${LOCKUP.width} 100`}
      role="img"
      aria-label={label}
      style={{ aspectRatio: `${LOCKUP.width} / 100` }}
      className={cn("h-7 w-auto shrink-0", className)}
    >
      <path d={LOCKUP.back} className="fill-brand-2" />
      <path d={LOCKUP.front} className="fill-brand" />
      <path d={LOCKUP.word} className="fill-current" fillRule="evenodd" />
    </svg>
  );
}

/**
 * The mark alone, beside the name written as text, or where space is short.
 * Decorative: where it stands for the name, use `Logo`.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${MARK.width} 100`}
      aria-hidden="true"
      style={{ aspectRatio: `${MARK.width} / 100` }}
      className={cn("h-7 w-auto shrink-0", className)}
    >
      <path d={MARK.back} className="fill-brand-2" />
      <path d={MARK.front} className="fill-brand" />
    </svg>
  );
}
