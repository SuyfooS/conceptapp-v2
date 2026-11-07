"use client";

import type { ComponentProps } from "react";
import { cn } from "./cn";

export type SwitchProps = Omit<
  ComponentProps<"button">,
  "onChange" | "value" | "children"
> & {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

/**
 * On or off, taking effect at once. The thumb squashes under the finger and
 * springs across, after Squish Switch from React Bits (see packages/ui/README.md).
 * Name it with `aria-labelledby` or `aria-label`.
 */
export function Switch({
  checked,
  onChange,
  disabled,
  className,
  ...props
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "group grid h-11 shrink-0 cursor-pointer place-items-center rounded-full",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "relative block h-8 w-[3.25rem] rounded-full transition-colors duration-200 ease-calm",
          "contrast-more:shadow-[inset_0_0_0_1px_var(--edge)]",
          checked ? "bg-accent" : "bg-surface-3",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 block size-7 rounded-full shadow-[0_1px_4px_rgb(16_18_26/0.25)]",
            "transition-[inset-inline-start,width] duration-300 ease-spring group-active:w-8",
            // On the accent, its readable pair: a light accent gets a dark thumb.
            checked
              ? "start-[calc(100%-1.875rem)] bg-accent-ink group-active:start-[calc(100%-2.125rem)]"
              : "start-0.5 bg-[var(--thumb)]",
          )}
        />
      </span>
    </button>
  );
}
