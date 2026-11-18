"use client";

import { type ReactNode, useRef } from "react";
import { ListGroup, ListRow } from "./list-row";
import { Sheet } from "./sheet";

/** What its rows share: an icon, a name, and the line under it. */
type ChoiceFace = {
  /** Its own key, which never changes ("photo", "pdf"). */
  key: string;
  icon: ReactNode;
  title: string;
  /** What it is for, under its name ("עד 10 מגה"). */
  hint?: ReactNode;
};

/**
 * One row of the attach sheet: the phone's file picker for what `accept`
 * names (a picture, a PDF), or a screen of its own (`href`; C7's document for
 * the business goes this way).
 */
export type AttachChoice = ChoiceFace &
  (
    | { accept: string; onPick: (file: File) => void; href?: never }
    | { href: string; accept?: never; onPick?: never }
  );

export type AttachSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  closeLabel: string;
  /** Its rows, in order: what the business takes ("תמונה", "קובץ PDF"). */
  choices: readonly AttachChoice[];
  /**
   * A line over the rows: why some aren't offered (a demo business takes no
   * files, so only the document for the business is there).
   */
  note?: ReactNode;
  /** Where the focus goes once it closed: the attach button, while it is there. */
  returnFocus?: () => HTMLElement | null | undefined;
};

/**
 * What the composer's attach button opens (chat C5, plan §11.2): one row for
 * each kind of thing a message can carry, each with its line, in the sheet a
 * short task takes. A row that picks a file opens the phone's picker and the
 * sheet steps aside; its file goes to `onPick`. The pickers stay outside the
 * sheet, so a file picked after it closed still arrives. A row with `href`
 * leads to a screen of its own (C7's third row, a document for the business).
 */
export function AttachSheet({
  open,
  onOpenChange,
  title,
  closeLabel,
  choices,
  note,
  returnFocus,
}: AttachSheetProps) {
  const pickers = useRef(new Map<string, HTMLInputElement>());
  return (
    <>
      {choices.map((choice) =>
        choice.accept !== undefined ? (
          <input
            key={choice.key}
            ref={(node) => {
              if (node) pickers.current.set(choice.key, node);
              else pickers.current.delete(choice.key);
            }}
            type="file"
            accept={choice.accept}
            hidden
            data-attach={choice.key}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // The same file can be picked again after a problem.
              event.target.value = "";
              if (file) choice.onPick(file);
            }}
          />
        ) : null,
      )}
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        closeLabel={closeLabel}
        returnFocus={returnFocus}
      >
        <div className="flex flex-col gap-3 px-2 pb-2">
          {note ? <p className="px-2 text-ink-2">{note}</p> : null}
          <ListGroup
            className="bg-elevated shadow-none"
            // Leaving for a row's own screen, the sheet steps aside.
            onClickCapture={(event) => {
              if ((event.target as HTMLElement).closest("a[href]")) {
                onOpenChange(false);
              }
            }}
          >
            {choices.map((choice) =>
              choice.href !== undefined ? (
                <ListRow
                  key={choice.key}
                  href={choice.href}
                  leading={choice.icon}
                  title={choice.title}
                  subtitle={choice.hint}
                />
              ) : (
                <ListRow
                  key={choice.key}
                  leading={choice.icon}
                  title={choice.title}
                  subtitle={choice.hint}
                  onClick={() => {
                    // Within the press, as the phone asks: then the sheet goes.
                    pickers.current.get(choice.key)?.click();
                    onOpenChange(false);
                  }}
                />
              ),
            )}
          </ListGroup>
        </div>
      </Sheet>
    </>
  );
}
