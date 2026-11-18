"use client";

import { Check, ChevronDown } from "lucide-react";
import { useLocale } from "next-intl";
import { DropdownMenu } from "radix-ui";
import { type ReactNode, useRef, useState } from "react";
import { cn } from "./cn";

export type ChoiceMenuProps = {
  /**
   * Names the control for screen readers, with exactly the words the button
   * shows in it, so speech input can say them: the field, as the row beside
   * it says, then those words ("מחלקה: מטבח", and "מחלקה: בחירה" before a
   * choice). `choiceShown` gives the words.
   */
  label: string;
  /** The key of the chosen option. */
  value: string;
  options: {
    key: string;
    label: string;
    /** A mark at the start of the option, in the menu only. */
    leading?: ReactNode;
    /** A second line under it, in the menu only. */
    hint?: string;
  }[];
  onChange: (key: string) => void;
  /** Shown while no option is chosen yet. */
  placeholder?: string;
  className?: string;
};

/**
 * What a ChoiceMenu's button shows for `value`: the chosen option's label,
 * or the placeholder while none of the options is chosen (a removed one
 * included). Its `label` takes these same words.
 */
export function choiceShown(
  options: readonly { key: string; label: string }[],
  value: string,
  placeholder?: string,
): string | undefined {
  return options.find((option) => option.key === value)?.label ?? placeholder;
}

/**
 * Choosing one of a short list: a quiet button with the current value, and a
 * menu that floats beside it. Takes the place of a native select where a choice
 * sits inside a row. In a sheet the menu stays inside it, so it belongs to the
 * dialog for screen readers and keeps the business's colour.
 */
export function ChoiceMenu({
  label,
  value,
  options,
  onChange,
  placeholder,
  className,
}: ChoiceMenuProps) {
  const locale = useLocale();
  const trigger = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const shown = choiceShown(options, value, placeholder);
  return (
    <DropdownMenu.Root
      dir={locale === "he" ? "rtl" : "ltr"}
      onOpenChange={(open) => {
        if (open) {
          setContainer(
            trigger.current?.closest<HTMLElement>('[role="dialog"]') ?? null,
          );
        }
      }}
    >
      <DropdownMenu.Trigger
        ref={trigger}
        aria-label={label}
        className={cn(
          "pressable inline-flex min-h-11 items-center gap-1 rounded-[10px] font-medium text-ink-2",
          "focus-visible:outline-2 focus-visible:outline-accent [&_svg]:size-4",
          className,
        )}
      >
        {shown}
        <ChevronDown aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal container={container ?? undefined}>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          collisionPadding={12}
          className="z-[60] min-w-44 rounded-[20px] bg-elevated p-1.5 shadow-float data-[state=open]:animate-[fade-in_150ms]"
        >
          <DropdownMenu.RadioGroup value={value} onValueChange={onChange}>
            {options.map((option) => (
              <DropdownMenu.RadioItem
                key={option.key}
                value={option.key}
                className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-[14px] px-3 text-md text-ink outline-none data-[highlighted]:bg-surface-2"
              >
                {option.leading || option.hint ? (
                  <span className="flex min-w-0 items-center gap-3 py-1.5">
                    {option.leading}
                    <span className="flex min-w-0 flex-col">
                      {option.label}
                      {option.hint ? (
                        <span className="text-ink-2 text-sm">
                          {option.hint}
                        </span>
                      ) : null}
                    </span>
                  </span>
                ) : (
                  option.label
                )}
                <DropdownMenu.ItemIndicator>
                  <Check aria-hidden="true" className="size-5" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
