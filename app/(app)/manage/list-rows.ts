/*
 * The rows of a list edited in place, a name typed over in each: the
 * departments, and the menu's categories and places (waiter mode P2). One
 * card of them, with hairlines between, as a ListGroup draws its rows.
 */

/** The hairline above every row but the first, from where its text starts. */
export const hairlineClass =
  "relative not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']";

/** A row: its name field, then its controls. */
export const rowClass = `${hairlineClass} flex min-h-[3.75rem] items-center gap-1 ps-4 pe-1.5`;

/** The name typed over, borderless inside its row. */
export const inputClass =
  "min-h-11 w-full min-w-0 rounded-[10px] bg-transparent text-md text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-accent";
