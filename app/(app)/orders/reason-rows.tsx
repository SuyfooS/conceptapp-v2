"use client";

import { ListGroup, ListRow } from "@ui/list-row";
import type { ReactNode } from "react";

/**
 * A fix in a sheet (waiter mode P5): its heading, what it means, and one
 * row per reason, where one tap does it. Refused to the person, its rows
 * stay to read, dimmed, with why under the heading.
 */
export function ReasonRows<R extends string>({
  title,
  hint,
  reasons,
  words,
  icon,
  disabled = null,
  onPick,
}: {
  title: string;
  hint?: string;
  reasons: readonly R[];
  words: (reason: R) => string;
  icon: ReactNode;
  /** Why these rows aren't the person's to press, or null when they are. */
  disabled?: string | null;
  onPick: (reason: R) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 px-2">
        <h3 className="font-semibold text-base">{title}</h3>
        {hint ? <p className="text-ink-2 text-sm">{hint}</p> : null}
        {disabled ? <p className="text-ink-2 text-sm">{disabled}</p> : null}
      </div>
      <ListGroup className="bg-elevated shadow-none">
        {reasons.map((reason) => (
          <ListRow
            key={reason}
            leading={icon}
            title={words(reason)}
            disabled={disabled !== null}
            onClick={() => onPick(reason)}
          />
        ))}
      </ListGroup>
    </section>
  );
}
