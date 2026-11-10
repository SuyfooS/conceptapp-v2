import type { ComponentProps, CSSProperties } from "react";
import { cn } from "./cn";

export type DeckCardProps = ComponentProps<"article"> & {
  /** Its place in the deck, from 0: each card pins a little lower than the last. */
  index: number;
};

/**
 * One card of a deck. On phones it stays pinned while the next slides over it,
 * so one thing shows at a time with the earlier ones peeking out behind; from
 * tablet up it is a plain card, and the parent lays the deck out as a grid.
 * Keep it shorter than a phone's screen, or the end is covered before it's read.
 */
export function DeckCard({ index, className, style, ...props }: DeckCardProps) {
  return (
    <article
      className={cn(
        "deck-card rounded-sheet bg-surface p-6 shadow-float md:p-8",
        className,
      )}
      style={{ "--i": index, ...style } as CSSProperties}
      {...props}
    />
  );
}
