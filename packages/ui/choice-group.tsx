"use client";

import { type ReactNode, useId } from "react";
import { ChoiceList, ChoiceRow } from "./choice-row";
import { FieldRow } from "./field-row";
import { Switch } from "./switch";

export type ChoiceGroupOption = {
  id: string;
  name: string;
  /** What it adds to the price ("+6.00 ₪"), in an LTR span. */
  hint?: ReactNode;
};

export type ChoiceGroupProps = {
  /** The group's name, its legend ("מידת עשייה"). */
  name: string;
  /** How it is picked, in words under the name ("חובה לבחור אחת"), never colour alone. */
  rule: string;
  /**
   * "one": exactly one, as radios. "many": any other, as switches, so a pick
   * can be taken off.
   */
  kind: "one" | "many";
  options: readonly ChoiceGroupOption[];
  /** The options picked, by id. */
  picked: readonly string[];
  onPick: (id: string, on: boolean) => void;
  /**
   * At its most, these words under the group ("נבחרו 2. מורידים אחת כדי
   * לבחור אחרת"), and the options not picked wait.
   */
  full?: string | null;
  /** Nothing is picked (the item sold out meanwhile). */
  disabled?: boolean;
};

/**
 * A group of an item's choices (waiter mode P6): its name and its rule in
 * words, then its options, on the sheet's elevated card. Exactly one is
 * radios; any other is switches, and at its most the rest are turned off
 * with the words that say why. Rows are 64px (radios) and 52px (switches).
 */
export function ChoiceGroup({
  name,
  rule,
  kind,
  options,
  picked,
  onPick,
  full = null,
  disabled = false,
}: ChoiceGroupProps) {
  const id = useId();
  const legend = (
    <span className="flex flex-col">
      <span>{name}</span>
      <span className="font-normal text-ink-2 text-sm">{rule}</span>
    </span>
  );
  if (kind === "one") {
    return (
      <ChoiceList
        legend={legend}
        legendClassName="text-md"
        groupClassName="bg-elevated shadow-none"
      >
        {options.map((option) => (
          <ChoiceRow
            key={option.id}
            name={id}
            value={option.id}
            title={option.name}
            hint={option.hint}
            checked={picked.includes(option.id)}
            disabled={disabled}
            onChange={() => onPick(option.id, true)}
          />
        ))}
      </ChoiceList>
    );
  }
  return (
    <ChoiceList
      legend={legend}
      legendClassName="text-md"
      groupClassName="bg-elevated shadow-none"
      note={full}
    >
      {options.map((option) => {
        const on = picked.includes(option.id);
        const switchId = `${id}-${option.id}`;
        // What it adds to the price is read with the switch, as it is with
        // a radio, whose row is its label.
        const hintId = option.hint ? `${switchId}-hint` : undefined;
        return (
          <FieldRow
            key={option.id}
            label={option.name}
            hint={option.hint}
            hintId={hintId}
            htmlFor={switchId}
          >
            <Switch
              id={switchId}
              aria-describedby={hintId}
              checked={on}
              disabled={disabled || (!on && full !== null)}
              onChange={(next) => onPick(option.id, next)}
            />
          </FieldRow>
        );
      })}
    </ChoiceList>
  );
}
