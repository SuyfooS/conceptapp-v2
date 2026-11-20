import { Plus } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Badge } from "./badge";
import { cn } from "./cn";
import { Switch } from "./switch";

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
  /**
   * Why else one tap can't add it (a choice to make, no department), under
   * its detail: greyed, and it can't be added.
   */
  reason?: string | null;
  /** Nothing adds it here (a view session): greyed, as the screen's other actions. */
  disabled?: boolean;
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
  reason = null,
  disabled = false,
  onPick,
}: MenuItemRowProps) {
  const out = soldOut !== null || reason !== null || disabled;
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
          {reason ? <span className="text-ink-2 text-sm">{reason}</span> : null}
        </span>
        {soldOut !== null ? (
          <Badge>{soldOut}</Badge>
        ) : out ? null : (
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

export type MenuEditRowProps = {
  name: string;
  /** Its price and what else it has ("62.00 ₪ · 2 בחירות"). */
  detail: ReactNode;
  /** What needs fixing, as a warning beside it ("בלי מחלקה"); none when null. */
  flag?: string | null;
  /** Opens the item to edit: the name is a button only with it. */
  onEdit?: () => void;
  /**
   * Sold out: a switch with its word beside it for whoever may mark it
   * (`onChange`), else the word alone while it is sold out, and nothing
   * while it isn't. `label` names the switch with the item ("נגמר: שניצל").
   */
  soldOut: {
    checked: boolean;
    label: string;
    word: string;
    onChange?: (on: boolean) => void;
  };
};

/**
 * An item of the menu as whoever runs it, or prepares it, sees it (waiter
 * mode P2): its name opens it, its price and choices under it, a warning
 * when it reaches no one, and "נגמר" at the end. A sold-out item's name is
 * quieter, and the word says it, never the colour alone. A list item, in a
 * `MenuItemList` like `MenuItemRow`.
 */
export function MenuEditRow({
  name,
  detail,
  flag = null,
  onEdit,
  soldOut,
}: MenuEditRowProps) {
  const text = (
    <>
      <span className={cn("font-medium", soldOut.checked && "text-ink-2")}>
        {name}
      </span>
      <span className="text-ink-2 text-sm">{detail}</span>
    </>
  );
  return (
    <li className="relative flex min-h-16 items-center gap-2 pe-3 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']">
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className="flex min-h-16 min-w-0 flex-1 flex-col justify-center px-4 py-2.5 text-start transition-colors duration-150 ease-calm hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          {text}
        </button>
      ) : (
        <span className="flex min-h-16 min-w-0 flex-1 flex-col justify-center px-4 py-2.5">
          {text}
        </span>
      )}
      {flag ? (
        <Badge tone="warning" className="shrink-0">
          {flag}
        </Badge>
      ) : null}
      {soldOut.onChange ? (
        <>
          {/* The switch's own name says it with the item; this is for the eye. */}
          <span aria-hidden="true" className="shrink-0 text-ink-2 text-sm">
            {soldOut.word}
          </span>
          <Switch
            checked={soldOut.checked}
            onChange={soldOut.onChange}
            aria-label={soldOut.label}
          />
        </>
      ) : soldOut.checked ? (
        <Badge className="shrink-0">{soldOut.word}</Badge>
      ) : null}
    </li>
  );
}
