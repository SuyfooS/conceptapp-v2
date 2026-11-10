"use client";

import type { ReactNode } from "react";
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
   * What choosing the row does, read out by its button in the first cell
   * ("פתיחת השעות של נועה"). Needed when the table has `onSelect`.
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
 * filling each first cell.
 */
export function DataTable({
  columns,
  rows,
  caption,
  onSelect,
  selected = null,
  className,
}: DataTableProps) {
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

  return (
    <div className={cn("overflow-x-auto", className)}>
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
    </div>
  );
}
