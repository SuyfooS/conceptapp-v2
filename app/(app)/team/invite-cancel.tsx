"use client";

import { Button } from "@ui/button";
import { UndoRow } from "@ui/undo-row";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, type ReactNode, use, useState } from "react";
import { useHeldWrite } from "../use-held-write";
import type {
  CancelInvite,
  InviteCancelResult,
  TeamChangeActionFailure,
} from "./team-change-types";

type Cancels = {
  /** Invites deleted on screen: held for their undo, or written. */
  gone: ReadonlySet<string>;
  /** The one waiting for its undo, with what its row says. */
  held: { id: string; message: string } | null;
  failure: TeamChangeActionFailure | null;
  start: (id: string, message: string) => void;
  undo: () => void;
};

const CancelsContext = createContext<Cancels | null>(null);

const settle = (run: Promise<InviteCancelResult>) =>
  run.catch(() => ({ ok: false, failure: "failed" }) as const);

/**
 * Deleting invites on the Team screen, in every shape at once: the row goes
 * at once, "ביטול" waits where the invites are (under their list, and on a
 * computer above the table, whose first rows they are), and the write is
 * held for it as
 * the access screen holds a removal (`useHeldWrite`), so a link deleted by
 * mistake keeps working. Once written the screen reads its list and counts
 * again; an invite that couldn't be deleted comes back, with why. With no
 * `cancel` (viewing as someone), nothing is offered.
 */
export function InviteCancels({
  cancel,
  children,
}: {
  /** `cancelInviteAction` bound to the business, or the demo's stand-in. */
  cancel: CancelInvite | null;
  children: ReactNode;
}) {
  return cancel ? (
    <CancelsState cancel={cancel}>{children}</CancelsState>
  ) : (
    children
  );
}

function CancelsState({
  cancel,
  children,
}: {
  cancel: CancelInvite;
  children: ReactNode;
}) {
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [shown, setShown] = useState<{ id: string; message: string } | null>(
    null,
  );
  const [failure, setFailure] = useState<TeamChangeActionFailure | null>(null);
  const without = (id: string) =>
    setGone((all) => new Set([...all].filter((one) => one !== id)));

  const held = useHeldWrite<string>(async (id) => {
    setShown((now) => (now?.id === id ? null : now));
    const result = await settle(cancel(id));
    if (!result.ok) {
      without(id);
      setFailure(result.failure);
    }
  });

  function start(id: string, message: string) {
    setFailure(null);
    setGone((all) => new Set([...all, id]));
    held.hold(id);
    setShown({ id, message });
  }

  function undo() {
    const id = held.release();
    setShown(null);
    if (id !== null) without(id);
  }

  return (
    <CancelsContext
      value={{
        gone,
        held: held.held !== null ? shown : null,
        failure,
        start,
        undo,
      }}
    >
      {children}
    </CancelsContext>
  );
}

/** An invite's row, until it is deleted on screen. */
export function UnlessCancelled({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const cancels = use(CancelsContext);
  return cancels?.gone.has(id) ? null : children;
}

/** The invites' list, while any is left on screen. */
export function WhileAnyInvite({
  ids,
  children,
}: {
  ids: readonly string[];
  children: ReactNode;
}) {
  const cancels = use(CancelsContext);
  if (cancels && ids.every((id) => cancels.gone.has(id))) return null;
  return children;
}

/** "מחיקת ההזמנה", for an invite the viewer may delete. */
export function CancelInviteButton({
  inviteId,
  name,
}: {
  inviteId: string;
  name: string;
}) {
  const cancels = use(CancelsContext);
  const t = useTranslations("app.team.cancel");
  if (!cancels) return null;
  return (
    <Button
      variant="ghost"
      className="text-danger"
      // The word it shows, then whose invite it deletes.
      aria-label={t("label", { name })}
      onClick={() => cancels.start(inviteId, t("done", { name }))}
    >
      <Trash2 aria-hidden="true" />
      {t("action")}
    </Button>
  );
}

/** "ההזמנה של … נמחקה" with "ביטול" by the invites, and why one came back. */
export function InviteCancelUndo() {
  const cancels = use(CancelsContext);
  const t = useTranslations("app.team");
  if (!cancels) return null;
  const { held, failure } = cancels;
  return (
    <>
      {held ? (
        // Each invite deleted a row of its own, said afresh.
        <UndoRow key={held.id} message={held.message} onUndo={cancels.undo} />
      ) : null}
      {failure ? (
        <p role="alert" className="px-1 text-base text-danger">
          {failure === "gone"
            ? t("cancel.gone")
            : t(`changes.failures.${failure}`)}
        </p>
      ) : null}
    </>
  );
}
