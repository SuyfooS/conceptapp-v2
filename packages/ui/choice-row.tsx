import { Check } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

/** One choice out of several, as a grouped list under a section title. */
export function ChoiceList({
  legend,
  legendClassName,
  error,
  className,
  children,
}: {
  legend: ReactNode;
  /** The legend is a section title; pass `sr-only` when a heading says it already. */
  legendClassName?: string;
  /** Under the list, in place of nothing: what is wrong with the choice. */
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <fieldset
      className={cn("m-0 flex min-w-0 flex-col border-0 p-0", className)}
    >
      <legend className={cn("mb-3 px-1 font-bold text-lg", legendClassName)}>
        {legend}
      </legend>
      <div className="overflow-hidden rounded-card bg-surface shadow-card">
        {children}
      </div>
      {error ? <p className="mt-2 px-1 text-danger text-sm">{error}</p> : null}
    </fieldset>
  );
}

export type ChoiceRowProps = Omit<ComponentProps<"input">, "type" | "title"> & {
  title: ReactNode;
  hint?: ReactNode;
  /** An icon at the start of the row. */
  leading?: ReactNode;
};

/**
 * A row with a real radio button, drawn as a check in a circle. The whole row
 * is the label, so anywhere on it selects it.
 */
export function ChoiceRow({
  title,
  hint,
  leading,
  className,
  ...input
}: ChoiceRowProps) {
  return (
    <label
      className={cn(
        "relative flex min-h-16 cursor-pointer items-center gap-3 px-4 py-2.5",
        "not-first:before:absolute not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']",
        leading ? "not-first:before:start-[68px]" : "not-first:before:start-4",
        "transition-colors duration-150 ease-calm hover:bg-surface-2/60 active:bg-surface-2",
        className,
      )}
    >
      {leading ? (
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-accent-soft text-accent [&_svg]:size-6 [&_svg]:stroke-[1.8]"
        >
          {leading}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium text-ink">{title}</span>
        {hint ? <span className="text-ink-2 text-sm">{hint}</span> : null}
      </span>
      <span className="relative grid size-7 shrink-0 place-items-center">
        <input
          type="radio"
          className={cn(
            "peer size-7 cursor-pointer appearance-none rounded-full border-2 border-edge transition-colors duration-150 ease-calm",
            "checked:border-accent checked:bg-accent",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          )}
          {...input}
        />
        <Check
          aria-hidden="true"
          strokeWidth={3}
          className="pointer-events-none absolute size-4 scale-50 text-accent-ink opacity-0 transition-[opacity,scale] duration-300 ease-spring peer-checked:scale-100 peer-checked:opacity-100"
        />
      </span>
    </label>
  );
}
