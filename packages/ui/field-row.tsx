import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * A plain value typed into a row: no box, at the row's end, as in a grouped
 * list of settings.
 */
export const rowInputClass = cn(
  "min-h-11 w-full min-w-0 rounded-[10px] bg-transparent px-2 text-end text-md text-ink",
  "placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-accent",
  "aria-invalid:text-danger",
);

/** A short value such as a time: a soft pill, the digits reading left to right. */
export const rowPillInputClass = cn(
  "min-h-11 rounded-[10px] bg-surface-2 px-3 text-center text-md text-ink",
  "focus-visible:outline-2 focus-visible:outline-accent",
  "aria-invalid:outline-2 aria-invalid:outline-danger",
  "[&::-webkit-calendar-picker-indicator]:hidden",
);

export type FieldRowProps = {
  label: ReactNode;
  /** A line under the label, for what the setting does. */
  hint?: ReactNode;
  /**
   * The id of the input in the row. Leave it out for a control that names
   * itself, such as a menu: the label is then a plain line.
   */
  htmlFor?: string;
  /** The input or control, at the row's end. */
  children: ReactNode;
  className?: string;
};

/**
 * One field in a ListGroup: the label at the start and the value at the end,
 * with the same inset hairline as a ListRow, so a form reads as a grouped list
 * and not as boxes stacked in a card.
 */
export function FieldRow({
  label,
  hint,
  htmlFor,
  children,
  className,
}: FieldRowProps) {
  const labelClass = cn("font-medium text-ink", !hint && "shrink-0");
  const name = htmlFor ? (
    <label htmlFor={htmlFor} className={labelClass}>
      {label}
    </label>
  ) : (
    <span className={labelClass}>{label}</span>
  );
  return (
    <div
      className={cn(
        "relative flex min-h-[3.25rem] items-center justify-between gap-3 px-4 py-1",
        "not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']",
        className,
      )}
    >
      {hint ? (
        <div className="flex min-w-0 flex-1 flex-col py-1.5">
          {name}
          <p className="text-ink-2 text-sm">{hint}</p>
        </div>
      ) : (
        name
      )}
      <div
        className={cn(
          "flex min-w-0 items-center justify-end",
          hint && "shrink-0",
        )}
      >
        {children}
      </div>
    </div>
  );
}
