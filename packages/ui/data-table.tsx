"use client";

import { type ReactNode, useId } from "react";
import { cn } from "./cn";

export type DataColumn = {
  key: string;
  /** The header's words. They wrap, never cut. */
  label: ReactNode;
  /** Where the column's cells sit; numbers usually at the end. */
  align?: "start" | "end";
  /** Digits read left to right, each the same width. */
  numeric?: boolean;
};

export type DataRow = {
  key: string;
  /** One cell per column key; a missing one is empty. */
  cells: Record<string, ReactNode>;
  /**
   * Names the row's button when its first cell's words don't tell the rows
   * apart (a person with two documents). It starts with those words, as
   * they show, and adds what tells the row apart ("נועה כהן, תצוגה של
   * אישור מחלה, לעסק"), so speech input can say what it sees. Leave out
   * when the cell's words are enough: the button is then named by them.
   */
  label?: string;
};

export type DataTableProps = {
  columns: readonly DataColumn[];
  rows: readonly DataRow[];
  /** Names the table for screen readers. */
  caption: string;
  /**
   * Choosing a row, by the button that fills its first cell and takes the
   * keyboard focus. Leave out for a table that only reads.
   */
  onSelect?: (key: string) => void;
  /**
   * What choosing a row does ("פתיחת השעות של החודש"), said after each row
   * button's name as its description. Not part of the name: the name holds
   * the words on the button.
   */
  rowHint?: string;
  /** The row chosen now, marked as current. */
  selected?: string | null;
  className?: string;
};

const cellClass = "px-4 py-3 align-middle";

/**
 * Rows and columns, for the full picture on a desktop. It sits in a `Card` and
 * has no edge of its own: hairlines between rows, and the first column held at
 * the start while a wide table scrolls sideways inside its card, so the page
 * never does. The header scrolls with the page: a sideways scroller is its
 * scroll container, which never scrolls down, so a header there can't stick.
 * Rows are at least 44px tall. A table one chooses rows of gets a button
 * filling each first cell. A table that only reads has nothing in it to
 * focus, so its scroller takes the keyboard itself, named by the caption:
 * a wide one still scrolls sideways by the arrow keys.
 */
export function DataTable({
  columns,
  rows,
  caption,
  onSelect,
  rowHint,
  selected = null,
  className,
}: DataTableProps) {
  const hintId = useId();
  const [first, ...rest] = columns;
  const align = (column: DataColumn) =>
    column.align === "end" ? "text-end" : "text-start";
  const content = (column: DataColumn, value: ReactNode) =>
    column.numeric ? (
      <span dir="ltr" className="tabular-nums">
        {value}
      </span>
    ) : (
      value
    );

  const table = (
    <table className="w-full border-collapse">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {columns.map((column, index) => (
            <th
              key={column.key}
              scope="col"
              className={cn(
                cellClass,
                align(column),
                "bg-surface font-medium text-ink-2 text-sm",
                index === 0 && "sticky start-0 z-10",
              )}
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const current = selected === row.key;
          return (
            <tr
              key={row.key}
              className={cn(
                "group border-line border-t",
                onSelect &&
                  "transition-colors duration-150 ease-calm hover:bg-surface-2",
              )}
            >
              {first ? (
                <th
                  scope="row"
                  className={cn(
                    cellClass,
                    align(first),
                    "sticky start-0 h-11 bg-surface font-medium text-ink",
                    onSelect && "group-hover:bg-surface-2",
                    // The chosen row: a bar in the business's colour at its
                    // start, which keeps every cell's colours readable.
                    current &&
                      "after:absolute after:inset-y-2 after:start-0 after:w-1 after:rounded-full after:bg-accent after:content-['']",
                  )}
                >
                  {onSelect ? (
                    <button
                      type="button"
                      aria-label={row.label}
                      aria-describedby={rowHint ? hintId : undefined}
                      aria-current={current ? "true" : undefined}
                      onClick={() => onSelect(row.key)}
                      className="flex min-h-11 w-full items-center text-start focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {content(first, row.cells[first.key])}
                    </button>
                  ) : (
                    content(first, row.cells[first.key])
                  )}
                </th>
              ) : null}
              {rest.map((column) => (
                <td
                  key={column.key}
                  className={cn(cellClass, align(column), "text-ink")}
                >
                  {content(column, row.cells[column.key])}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  // A table one chooses rows of is reached through its row buttons.
  if (onSelect) {
    return (
      <div className={cn("overflow-x-auto", className)}>
        {table}
        {rowHint ? (
          <span id={hintId} hidden>
            {rowHint}
          </span>
        ) : null}
      </div>
    );
  }
  // One that only reads: its scroller, a region named by the caption, takes
  // the keyboard, its ring inside the card's edge, along its rounded corners.
  return (
    <section
      aria-label={caption}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroller with nothing to focus inside must take the keyboard itself to scroll by keys (axe scrollable-region-focusable)
      tabIndex={0}
      className={cn(
        "overflow-x-auto rounded-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
        className,
      )}
    >
      {table}
    </section>
  );
}
