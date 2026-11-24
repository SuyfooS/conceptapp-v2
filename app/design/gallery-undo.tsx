"use client";

import { announce } from "@ui/announcer";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { IconButton } from "@ui/icon-button";
import { ListGroup, ListRow } from "@ui/list-row";
import { UndoRow } from "@ui/undo-row";
import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { type HeldTimer, heldTimer } from "../(app)/held-timer";
import { HOLD_MS } from "../(app)/use-held-write";

const ROWS = ["first", "second"] as const;
type RowKey = (typeof ROWS)[number];

/**
 * The gallery's undo row: two rows, each with its remove. Removing one
 * puts "ביטול" in its place with the focus, held as a screen holds a write
 * (`heldTimer`, eight seconds), which waits while "ביטול" is being reached.
 * Removing the other while it is up lets the first go for good and starts
 * again: a row of its own (keyed by what it undoes), with the focus, its
 * own wait and its own words. Undone, the row is back with its button
 * focused; its time up, the row is gone for good and the focus goes to
 * what is left. "החזרת השורות" brings both back and keeps the focus,
 * dimmed, with nothing left to bring back. Nothing is stored.
 */
export function GalleryUndoRows() {
  const t = useTranslations("design");
  const [gone, setGone] = useState<readonly RowKey[]>([]);
  const [held, setHeld] = useState<RowKey | null>(null);
  /** The hold of the row last removed, and which row it holds. */
  const hold = useRef<{ key: RowKey; timer: HeldTimer } | null>(null);
  const buttons = useRef(new Map<RowKey, HTMLButtonElement>());
  const reset = useRef<HTMLButtonElement>(null);
  const nameOf = (key: RowKey) =>
    key === "first" ? t("undoRowFirst") : t("undoRowSecond");

  function letGo() {
    hold.current?.timer.clear();
    hold.current = null;
  }

  function remove(key: RowKey) {
    // An earlier one's time ends now: it stays gone.
    letGo();
    setGone((now) => [...now, key]);
    setHeld(key);
    const timer = heldTimer(HOLD_MS, () => {
      hold.current = null;
      setHeld(null);
    });
    hold.current = { key, timer };
  }

  /**
   * Only a row's own hold waits for it: an earlier row, going as the next
   * comes, lets go of nothing newer.
   */
  function waits(key: RowKey, waiting: boolean) {
    const now = hold.current;
    if (now?.key !== key) return;
    if (waiting) now.timer.pause();
    else now.timer.resume();
  }

  function undo() {
    const key = held;
    if (key === null) return;
    letGo();
    setGone((now) => now.filter((one) => one !== key));
    setHeld(null);
  }

  function bringBack() {
    // Dimmed with nothing to bring back, and still where the focus is.
    if (gone.length === 0) return;
    letGo();
    setGone([]);
    setHeld(null);
  }

  const shown = ROWS.filter((key) => !gone.includes(key));
  return (
    <div className="flex flex-col gap-3">
      {shown.length > 0 ? (
        <ListGroup>
          {shown.map((key) => (
            <ListRow
              key={key}
              title={nameOf(key)}
              trailing={
                <IconButton
                  ref={(node) => {
                    if (node) buttons.current.set(key, node);
                    else buttons.current.delete(key);
                  }}
                  label={t("undoRowRemove", { name: nameOf(key) })}
                  icon={<X />}
                  onClick={() => remove(key)}
                />
              }
            />
          ))}
        </ListGroup>
      ) : null}
      {held ? (
        <UndoRow
          // Each removal a row of its own, so its autoFocus acts again.
          key={held}
          message={t("undoRowRemoved", { name: nameOf(held) })}
          onUndo={undo}
          autoFocus
          onWaitingChange={(waiting) => waits(held, waiting)}
          // Undone: its own row's button; gone for good: what is left.
          focusAfter={() => [
            buttons.current.get(held) ?? null,
            ...ROWS.map((key) => buttons.current.get(key) ?? null),
            reset.current,
          ]}
        />
      ) : null}
      <Button
        ref={reset}
        variant="secondary"
        onClick={bringBack}
        // Not disabled: pressed, it would drop the focus it holds.
        aria-disabled={gone.length === 0 || undefined}
        className="self-start"
      >
        {t("undoRowReset")}
      </Button>
    </div>
  );
}

/**
 * The page's announcer: a line a screen reader says with nothing on screen,
 * in the gallery's language.
 */
export function GalleryAnnouncer() {
  const t = useTranslations("design");
  const locale = useLocale();
  return (
    <Card className="flex flex-col items-start gap-2">
      <Button
        variant="secondary"
        onClick={() => announce(t("announcerLine"), { lang: locale })}
      >
        {t("announcerSay")}
      </Button>
      <p className="text-ink-2 text-sm">{t("announcerHint")}</p>
    </Card>
  );
}
