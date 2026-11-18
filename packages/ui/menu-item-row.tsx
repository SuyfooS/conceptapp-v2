import { Plus } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Badge } from "./badge";
import { cn } from "./cn";

export type MenuItemRowProps = {
  name: string;
  /** Its price and what else to know before adding it ("62.00 ₪ · עם בחירות"). */
  detail: ReactNode;
  /** How many of it the order being built holds already. */
  count: number;
  /** Said after the count, to screen readers ("בטיוטה"). */
  countLabel: string;
  /** Sold out tonight: greyed, saying so in these words ("נגמר"), and it can't be added. */
  soldOut?: string | null;
  /** One tap adds it, or opens its choices. */
  onPick: () => void;
};

/**
 * An item to add to an order (waiter mode): the whole row adds it with one
 * tap, and one with choices says so and opens them. It counts what of it
 * the order holds. A list item: put it in a `MenuItemList`.
 */
export function MenuItemRow({
  name,
  detail,
  count,
  countLabel,
  soldOut = null,
  onPick,
}: MenuItemRowProps) {
  const out = soldOut !== null;
  return (
    <li className="relative not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']">
      <button
        type="button"
        disabled={out}
        onClick={onPick}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-start",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
          out
            ? "opacity-50"
            : "transition-colors duration-150 ease-calm hover:bg-surface-2 active:bg-surface-3",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{name}</span>
          <span className="text-ink-2 text-sm">{detail}</span>
        </span>
        {out ? (
          <Badge>{soldOut}</Badge>
        ) : (
          <>
            {count > 0 ? (
              <span className="grid min-w-8 place-items-center rounded-full bg-accent-soft px-2 py-1 font-bold text-base tabular-nums">
                {count}
                <span className="sr-only"> {countLabel}</span>
              </span>
            ) : null}
            <Plus aria-hidden="true" className="size-6 shrink-0 text-accent" />
          </>
        )}
      </button>
    </li>
  );
}

/** The items' card: one soft card, with hairlines between its rows. */
export function MenuItemList({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "overflow-hidden rounded-card bg-surface shadow-card",
        className,
      )}
      {...props}
    />
  );
}
