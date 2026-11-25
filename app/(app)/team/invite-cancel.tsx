"use client";

import { Button } from "@ui/button";
import { firstOnScreen } from "@ui/focus-after";
import { UndoRow } from "@ui/undo-row";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, type ReactNode, use, useRef, useState } from "react";
import { useHeldWrite } from "../use-held-write";
import {
  inViewWhenFocused,
  inviteCancelTarget,
  invitesLeft,
  sectionTitle,
} from "./invite-focus";
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
  /**
   * The "ביטול" of invite `id` is being reached (`@ui/undo-wait`): its held
   * write waits as long, and no other's.
   */
  waits: (id: string, waiting: boolean) => void;
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
 * mistake keeps working. "ביטול" takes the focus the pressed button had,
 * and the hold waits while it is being reached (`InviteCancelUndo`). Once
 * written the screen reads its list and counts
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

  // An earlier invite's row, going as the next is deleted, lets go of
  // nothing newer: the next one's own focus may be holding it.
  function waits(id: string, waiting: boolean) {
    if (waiting) held.pause(id);
    else held.resume(id);
  }

  return (
    <CancelsContext
      value={{
        gone,
        held: held.held !== null ? shown : null,
        failure,
        start,
        undo,
        waits,
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
      // Found again by its invite once "ביטול" brings the row back
      // (`inviteCancelTarget`).
      data-invite-cancel={inviteId}
      onClick={() => cancels.start(inviteId, t("done", { name }))}
    >
      <Trash2 aria-hidden="true" />
      {t("action")}
    </Button>
  );
}

/**
 * "ההזמנה של … נמחקה" with "ביטול" by the invites, and why one came back.
 * "מחיקת ההזמנה" went with its row, so "ביטול" takes the focus as it
 * appears: each shape draws it, and only the one on screen can take it.
 * While it is being reached the write waits. Undone, the focus goes back to
 * the row's "מחיקת ההזמנה", brought into view; its time up, to the title of
 * this section, which stays where it is (`invitesLeft`), else the page's.
 */
export function InviteCancelUndo({
  ids,
}: {
  /**
   * The invites its section lists, which is drawn anew once none is left (a
   * phone's and a tablet's lists, which then put the team first). None: the
   * section stays (the desktop's table, which lists the team too).
   */
  ids?: readonly string[];
}) {
  const cancels = use(CancelsContext);
  const t = useTranslations("app.team");
  // Where this shape's section is, for its title.
  const anchor = useRef<HTMLSpanElement>(null);
  if (!cancels) return null;
  const { held, failure, gone } = cancels;
  const stays = ids === undefined || invitesLeft(ids, gone);
  return (
    <>
      <span ref={anchor} hidden />
      {held ? (
        // Each invite deleted a row of its own, said afresh.
        <UndoRow
          key={held.id}
          message={held.message}
          onUndo={cancels.undo}
          autoFocus
          onWaitingChange={(waiting) => cancels.waits(held.id, waiting)}
          focusAfter={() => [
            // Back where it was, maybe far above this row: brought into
            // view as it takes the focus.
            inViewWhenFocused(firstOnScreen([inviteCancelTarget(held.id)])),
            stays ? sectionTitle(anchor.current) : null,
          ]}
        />
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
