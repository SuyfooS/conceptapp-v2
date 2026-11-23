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
 * Undone, the row is back with its button focused; its time up, the row is
 * gone for good and the focus goes to what is left. Nothing is stored.
 */
export function GalleryUndoRows() {
  const t = useTranslations("design");
  const [gone, setGone] = useState<readonly RowKey[]>([]);
  const [held, setHeld] = useState<RowKey | null>(null);
  const hold = useRef<HeldTimer | null>(null);
  const buttons = useRef(new Map<RowKey, HTMLButtonElement>());
  const reset = useRef<HTMLButtonElement>(null);
  const nameOf = (key: RowKey) =>
    key === "first" ? t("undoRowFirst") : t("undoRowSecond");

  function remove(key: RowKey) {
    // An earlier one's time ends now: it stays gone.
    hold.current?.clear();
    setGone((now) => [...now, key]);
    setHeld(key);
    hold.current = heldTimer(HOLD_MS, () => {
      hold.current = null;
      setHeld(null);
    });
  }

  function undo() {
    const key = held;
    if (key === null) return;
    hold.current?.clear();
    hold.current = null;
    setGone((now) => now.filter((one) => one !== key));
    setHeld(null);
  }

  function bringBack() {
    hold.current?.clear();
    hold.current = null;
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
          message={t("undoRowRemoved", { name: nameOf(held) })}
          onUndo={undo}
          autoFocus
          onWaitingChange={(waiting) =>
            waiting ? hold.current?.pause() : hold.current?.resume()
          }
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
        disabled={gone.length === 0}
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
