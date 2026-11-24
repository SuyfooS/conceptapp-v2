import { ListGroup } from "@ui/list-row";
import { type ReactNode, useId } from "react";

/**
 * A titled group of rows in one of the builder's sheets: who could be put on
 * a shift, by where they stand, or what copying last week does, day by day.
 * The group is named by its title, which is an h4 under another heading of
 * the sheet (`level`). `mark` names the heading (`data-sheet-heading`), for
 * the focus to land on once the row that had it went.
 */
export function SheetSection({
  title,
  level = 3,
  mark,
  children,
}: {
  title: ReactNode;
  level?: 3 | 4;
  mark?: string;
  children: ReactNode;
}) {
  const id = useId();
  const Heading = level === 3 ? "h3" : "h4";
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would style and announce these rows as a form
    <div role="group" aria-labelledby={id} className="flex flex-col">
      <Heading
        id={id}
        data-sheet-heading={mark}
        className="px-3 pt-3 pb-1.5 font-semibold text-ink-2 text-sm"
      >
        {title}
      </Heading>
      <ListGroup className="bg-elevated shadow-none">{children}</ListGroup>
    </div>
  );
}
