"use client";

import { parseShekels } from "@domain/money";
import { MAX_ITEM_AGOROT, typedAgorot } from "@domain/order-taking";
import { cn } from "@ui/cn";
import { fieldInputClass, ltrInputClass } from "@ui/text-field";
import { useState } from "react";

/**
 * A price typed in place, on the desktop's table: saved as the field is left
 * (or on Enter), and one that isn't clear stays with its words until it is.
 * Drawn again from the item when its price comes back (`key` it by price).
 */
export function PriceCell({
  agorot,
  label,
  unclearWords,
  onPrice,
}: {
  agorot: number;
  /** Names the field with its item ("המחיר: שניצל"). */
  label: string;
  unclearWords: string;
  onPrice: (agorot: number) => void;
}) {
  const [value, setValue] = useState(typedAgorot(agorot));
  const [unclear, setUnclear] = useState(false);
  return (
    <span className="flex flex-col gap-1">
      <input
        dir="ltr"
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        aria-invalid={unclear || undefined}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setUnclear(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        onBlur={() => {
          const typed = parseShekels(value, MAX_ITEM_AGOROT);
          if (typed === null) {
            setUnclear(true);
            return;
          }
          if (typed !== agorot) onPrice(typed);
        }}
        className={cn(fieldInputClass, ltrInputClass, "min-h-11 w-28 py-1.5")}
      />
      {unclear ? (
        <span role="alert" className="max-w-56 text-danger text-sm">
          {unclearWords}
        </span>
      ) : null}
    </span>
  );
}
