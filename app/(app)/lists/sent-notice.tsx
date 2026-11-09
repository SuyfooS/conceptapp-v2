"use client";

import { StatusToast } from "@ui/status-toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { UndoRow } from "../manage/undo-row";
import type { ListActionResult, ListFailure } from "./list-types";

/**
 * Right after sending: where the list went, and the way to take it back for
 * five minutes while nobody has started it, which the database checks again
 * (`cancel_unstarted_list`). Lists always draws it, so it outlives the list:
 * once taken back, the list leaves the address and the screen, and this still
 * says so.
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

  return (
    <>
      <StatusToast
        message={cancelled ? t("send.cancelled") : null}
        stamp={cancelled ?? undefined}
      />
      {shown && !started ? (
        <UndoRow
          message={shown.message}
          onUndo={() => undo(shown.listId)}
          pending={pending}
        />
      ) : null}
      {started ? (
        <p role="status" className="px-1 text-ink-2">
          {t("send.started")}
        </p>
      ) : failure ? (
        <p role="alert" className="px-1 text-danger text-sm">
          {t("send.cancelFailed")}
        </p>
      ) : null}
    </>
  );
}
