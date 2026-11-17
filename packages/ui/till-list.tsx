import type { ReactNode } from "react";
import { cn } from "./cn";

export type TillRow = {
  key: string;
  qty: number;
  name: string;
  /** The options chosen, under the name. */
  choices?: readonly string[];
  /** Its price for one, in an LTR span. */
  price: ReactNode;
};

export type TillListProps = {
  /** Names the list ("לפי פריט", "סבב 2"). */
  label: string;
  rows: readonly TillRow[];
  /** Said when there is nothing on it. */
  empty: string;
  /** Said before the quantity, to screen readers ("כמות"). */
  qtyLabel: string;
  /** Said before the price, to screen readers ("מחיר ליחידה"). */
  priceLabel: string;
  /** The till's tablet at the counter: names and prices large, to read from a step away. */
  large?: boolean;
};

/**
 * What the cashier rings into the business's own register (waiter mode):
 * each line with how many, what, the choices and the price for one. No
 * total: the register adds it up, and the screen says so beside the list.
 */
export function TillList({
  label,
  rows,
  empty,
  qtyLabel,
  priceLabel,
  large = false,
}: TillListProps) {
  if (rows.length === 0) {
    return (
      <p
        className={cn(
          "rounded-card bg-surface px-4 py-4 text-ink-2 shadow-card",
          large && "text-lg",
        )}
      >
        {empty}
      </p>
    );
  }
  return (
    <ul
      aria-label={label}
      className="overflow-hidden rounded-card bg-surface shadow-card"
    >
      {rows.map((row) => (
        <li
          key={row.key}
          className={cn(
            "relative flex items-center gap-3 px-4 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']",
            large ? "min-h-18 py-3" : "min-h-14 py-2.5",
          )}
        >
          <span
            dir="ltr"
            className={cn(
              "grid shrink-0 place-items-center rounded-full bg-surface-2 font-bold tabular-nums",
              large
                ? "min-w-12 px-3 py-1.5 text-lg"
                : "min-w-9 px-2 py-1 text-base",
            )}
          >
            <span className="sr-only">{qtyLabel} </span>
            {row.qty}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className={cn("font-medium", large && "font-semibold text-lg")}
            >
              {row.name}
            </span>
            {row.choices && row.choices.length > 0 ? (
              <span
                className={cn("text-ink-2", large ? "text-base" : "text-sm")}
              >
                {row.choices.join(" · ")}
              </span>
            ) : null}
          </span>
          <span
            className={cn(
              "shrink-0",
              large ? "text-ink text-lg" : "text-ink-2",
            )}
          >
            <span className="sr-only">{priceLabel} </span>
            {row.price}
          </span>
        </li>
      ))}
    </ul>
  );
}
