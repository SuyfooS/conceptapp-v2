"use client";

import { type KeyboardEvent, type ReactNode, useId, useState } from "react";
import { cn } from "./cn";
import { fieldInputClass } from "./text-field";

export type SearchOption = { key: string; label: string };

/**
 * Choosing one of a long list by typing (a town, a country): a combobox as
 * WAI-ARIA 1.2 has it, the matches in a list under the field, at most as
 * many as the caller gives, each a 44px row whose words wrap. Arrows move
 * through them, Enter picks, Escape clears what was typed. Once picked, the
 * field shows the choice, and typing again searches again. The search is
 * the caller's (`options` for `query`), and so are the words.
 */
export function SearchField({
  label,
  query,
  onQuery,
  options,
  picked,
  onPick,
  emptyText,
  placeholder,
  hint,
  error,
  onFocus,
  name,
}: {
  label: string;
  query: string;
  onQuery: (query: string) => void;
  /** The matches for `query`, best first. */
  options: readonly SearchOption[];
  picked: SearchOption | null;
  /** The key picked, or null when the person types again. */
  onPick: (key: string | null) => void;
  /** Said under the field when what was typed meets nothing. */
  emptyText: string;
  placeholder?: string;
  hint?: ReactNode;
  error?: ReactNode;
  /** The field took the focus: the caller may load its list now. */
  onFocus?: () => void;
  name?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const messageId = `${id}-message`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const typed = query.trim() !== "";
  const showList = open && typed && options.length > 0;
  const none = open && typed && options.length === 0;
  const message = none ? emptyText : (error ?? hint);
  const optionId = (at: number) => `${id}-option-${at}`;

  function type(text: string) {
    if (picked) onPick(null);
    onQuery(text);
    setActive(0);
    setOpen(true);
  }

  function choose(option: SearchOption) {
    onPick(option.key);
    onQuery("");
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && options.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((at) => (at + 1) % options.length);
    } else if (event.key === "ArrowUp" && options.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((at) => (at - 1 + options.length) % options.length);
    } else if (event.key === "Enter" && showList) {
      const option = options[active];
      if (option) {
        event.preventDefault();
        choose(option);
      }
    } else if (event.key === "Escape") {
      if (typed || picked) event.preventDefault();
      if (picked) onPick(null);
      onQuery("");
      setOpen(false);
    }
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className="font-medium text-ink text-sm">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? optionId(active) : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={placeholder}
        value={picked && !open ? picked.label : query}
        onChange={(event) => type(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          onFocus?.();
          // A choice shown is replaced by whatever is typed next.
          if (picked) event.currentTarget.select();
        }}
        onBlur={() => setOpen(false)}
        className={fieldInputClass}
      />
      {/* A listbox of its own, not a select: the matches change as the
          person types, and the input keeps the keyboard. */}
      <div
        id={listId}
        role="listbox"
        aria-label={label}
        tabIndex={-1}
        hidden={!showList}
        className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-[20px] bg-elevated p-1.5 shadow-float"
      >
        {options.map((option, at) => (
          // The input keeps the keyboard (aria-activedescendant), so an
          // option only takes a press, which picks before the field's blur
          // closes the list.
          // biome-ignore lint/a11y/useKeyWithClickEvents: the keys are the combobox input's, as WAI-ARIA has it
          <div
            key={option.key}
            id={optionId(at)}
            role="option"
            tabIndex={-1}
            aria-selected={at === active}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(option)}
            className={cn(
              "flex min-h-11 cursor-pointer items-center rounded-[14px] px-3 py-1.5 text-md text-ink",
              at === active && "bg-surface-2",
            )}
          >
            {option.label}
          </div>
        ))}
      </div>
      <p
        id={messageId}
        aria-live="polite"
        className={cn(
          "text-sm",
          error && !none ? "text-danger" : "text-ink-2",
          message ? undefined : "sr-only",
        )}
      >
        {message}
      </p>
    </div>
  );
}
