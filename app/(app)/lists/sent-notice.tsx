"use client";

import { focusFirst } from "@ui/focus-after";
import { StatusToast } from "@ui/status-toast";
import { UndoRow } from "@ui/undo-row";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { refusalArrived } from "../manage/editor-focus";
import type { ListActionResult, ListFailure } from "./list-types";
import { arrivalTaken, cameFromPress, sentArrival } from "./press-arrival";

/**
 * Right after sending: where the list went, and the way to take it back for
 * five minutes while nobody has started it, which the database checks again
 * (`cancel_unstarted_list`). Lists always draws it, so it outlives the list:
 * once taken back, the list leaves the address and the screen, and this still
 * says so. Lists comes right after the press that sent it, which went with
 * the send screen: "ביטול" takes the focus as it appears, and its focus says
 * where the list went; reached any other way (a reload, the address again),
 * the focus stays where it is, and the row says itself (`press-arrival`).
 * "ביטול" has the focus back once taking it back was refused, and only then
 * does the line under it say so; refused because someone started it, the
 * row goes, the page's title has the focus, and then the line says why
 * (accessibility, part 8).
 */
export function SentNotice({
  sent,
  cancel,
  listsHref,
}: {
  /** The list just sent, with "The list went to the kitchen"; null otherwise. */
  sent: { listId: string; message: string } | null;
  cancel: (listId: string) => Promise<ListActionResult>;
  /** Lists without the address that brought this notice. */
  listsHref: string;
}) {
  const t = useTranslations("app.lists");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cancelled, setCancelled] = useState<string | null>(null);
  const [failed, setFailed] = useState<{
    listId: string;
    reason: ListFailure;
  } | null>(null);

  function undo(listId: string) {
    start(async () => {
      let result: ListActionResult;
      try {
        result = await cancel(listId);
      } catch {
        result = { ok: false, failure: "failed" };
      }
      if (!result.ok) {
        setFailed({ listId, reason: result.failure });
        return;
      }
      setFailed(null);
      setCancelled(listId);
      router.replace(listsHref);
    });
  }

  const shown = sent && sent.listId !== cancelled ? sent : null;
  // Someone started it, or it closed: the way back is gone, and this says
  // why, even once Lists, refreshed, no longer has it as just sent.
  const started =
    failed !== null &&
    failed.reason === "finished" &&
    (sent === null || sent.listId === failed.listId);
  const failure =
    !started && shown && failed?.listId === shown.listId ? failed : null;

  // Right after the press that sent it, its "ביטול" takes the focus: read
  // as it draws, taken once it has.
  const arrival = shown ? sentArrival(shown.listId) : null;
  const fromPress = arrival !== null && cameFromPress(arrival);
  useEffect(() => {
    if (arrival) arrivalTaken(arrival);
  }, [arrival]);

  // "ביטול" waited, disabled, and the focus with it went: refused (a slip,
  // offline), the row stays, and the focus is back on it; someone started
  // the list meanwhile, the row goes, and the focus to the page's title.
  // Unless put elsewhere meanwhile; and then the line under it says why
  // (`said`): said before that move, it would be cut off. Once for each
  // refusal: the screen shown again from a hidden <Activity> leaves the
  // focus where it is.
  const refusal = started || failure ? failed : null;
  const undoButton = useRef<HTMLButtonElement>(null);
  const refocused = useRef<typeof failed>(null);
  const [said, setSaid] = useState<typeof failed>(null);
  useEffect(() => {
    if (refusalArrived(refocused, refusal, pending)) {
      focusFirst(started ? [] : [undoButton.current], { title: started });
      setSaid(refusal);
    }
  }, [refusal, started, pending]);
  const saying = refusal !== null && refusal === said && !pending;

  return (
    <>
      <StatusToast
        message={cancelled ? t("send.cancelled") : null}
        stamp={cancelled ?? undefined}
      />
      {shown && !started ? (
        <UndoRow
          // Each list sent a row of its own, said afresh.
          key={shown.listId}
          message={shown.message}
          onUndo={() => undo(shown.listId)}
          pending={pending}
          autoFocus={fromPress}
          buttonRef={undoButton}
        />
      ) : null}
      {!saying ? null : started ? (
        // Drawn once the focus has gone on, said as it is drawn.
        <p role="alert" className="px-1 text-ink-2">
          {t("send.started")}
        </p>
      ) : (
        // Drawn for each refusal once the focus is back.
        <p role="alert" className="px-1 text-danger text-sm">
          {t("send.cancelFailed")}
        </p>
      )}
    </>
  );
}
