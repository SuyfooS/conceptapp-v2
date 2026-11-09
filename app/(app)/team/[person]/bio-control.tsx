"use client";

import type { ProfileFailure, ProfileSaveResult } from "@domain/profile";
import { ListGroup } from "@ui/list-row";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  use,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { UndoRow } from "../../manage/undo-row";
import { settle } from "../../me/about-sheets";

/** How long a delete waits for "ביטול" before it is sent. */
export const BIO_HOLD_MS = 8000;

/**
 * shown: the line as it is (or none); pending: deleted on screen, waiting
 * for the hold; sending: on its way, past undoing.
 */
type Phase = "shown" | "pending" | "sending";

type BioValue = {
  bio: string | null;
  phase: Phase;
  failure: ProfileFailure | null;
  canClear: boolean;
  clear: () => void;
  undo: () => void;
};

const BioContext = createContext<BioValue | null>(null);

function useBio(): BioValue {
  const value = use(BioContext);
  if (!value) throw new Error("Inside BioState only");
  return value;
}

/**
 * A colleague's line about themselves, and its deletion by an owner or
 * manager. Deleting hides the line at once and offers "ביטול" for a moment;
 * only then, or when the screen is left inside the app, is the delete sent,
 * for the line as it was on the screen: one rewritten since stays. An undo
 * after the fact would need a way to write into someone else's profile,
 * which nothing has. Closing the tab inside the hold keeps the line.
 */
export function BioState({
  personId,
  bio,
  canClear,
  clearBio,
  children,
}: {
  personId: string;
  bio: string | null;
  /** The viewer may delete this person's line (`mayClearBio`, not viewing). */
  canClear: boolean;
  clearBio: (personId: string, seenBio: string) => Promise<ProfileSaveResult>;
  children: ReactNode;
}) {
  const [shown, setShown] = useState(bio);
  const [seen, setSeen] = useState(bio);
  const [phase, setPhase] = useState<Phase>("shown");
  const [failure, setFailure] = useState<ProfileFailure | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The line the delete on hold is for, as the screen showed it.
  const meant = useRef<string | null>(null);
  // The server's line changed (it was deleted, or rewritten): show it.
  if (bio !== seen) {
    setSeen(bio);
    setShown(bio);
    setPhase("shown");
  }

  async function send() {
    timer.current = null;
    const line = meant.current;
    if (line === null) return;
    setPhase("sending");
    const result = await settle(clearBio(personId, line));
    // "changed": the action read the page again, and the new line arrives
    // with it.
    if (result.ok) setShown(null);
    else setFailure(result.failure);
    setPhase("shown");
  }

  function clear() {
    if (timer.current !== null || phase !== "shown" || shown === null) return;
    meant.current = shown;
    setFailure(null);
    setPhase("pending");
    timer.current = setTimeout(send, BIO_HOLD_MS);
  }

  function undo() {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
    setPhase("shown");
  }

  // Leaving the screen inside the hold: the delete goes now, as it would
  // have. Next keeps the screen (cacheComponents hides it in an <Activity>)
  // and shows it again, as it was, on the way back: so it shows the delete
  // as done, with no undo that can't, and the line again, with why, if the
  // delete fails. A layout effect, so the way back never flashes the hold.
  useLayoutEffect(
    () => () => {
      const line = meant.current;
      if (timer.current === null || line === null) return;
      clearTimeout(timer.current);
      timer.current = null;
      setShown(null);
      setPhase("shown");
      void settle(clearBio(personId, line)).then((result) => {
        if (result.ok) return;
        // The line back, unless the server's own (read again) took its place.
        setShown((now) => now ?? line);
        setFailure(result.failure);
      });
    },
    [clearBio, personId],
  );

  return (
    <BioContext value={{ bio: shown, phase, failure, canClear, clear, undo }}>
      {children}
    </BioContext>
  );
}

/** The line under the name, or what stands in for it. */
export function BioLine({ noBio }: { noBio: string }) {
  const { bio, phase } = useBio();
  if (phase !== "shown") return null;
  return bio ? (
    <p className="-mt-1 text-pretty text-md">{bio}</p>
  ) : (
    <p className="-mt-1 text-ink-2 text-md">{noBio}</p>
  );
}

/** "המשפט של נועה כהן נמחק" with "ביטול", for as long as the hold lasts. */
export function BioUndo({ message }: { message: string }) {
  const { phase, undo } = useBio();
  return phase === "pending" ? (
    <div className="mt-1">
      <UndoRow message={message} onUndo={undo} />
    </div>
  ) : null;
}

/**
 * What the viewer can do about this person: call them, and delete their line
 * when it is there and they may. Nothing at all when neither applies. The
 * delete is a group of its own, centred and with no chevron: it leads
 * nowhere, it acts.
 */
export function PersonActions({
  call,
  clearLabel,
  clearHint,
}: {
  /** The call row, when the business has their number. */
  call: ReactNode;
  clearLabel: string;
  clearHint: string;
}) {
  const t = useTranslations("app.team.person.failures");
  const { bio, phase, failure, canClear, clear } = useBio();
  const clearable = canClear && bio !== null && phase === "shown";
  if (!call && !clearable && !failure) return null;
  return (
    <section className="flex flex-col gap-4">
      {call ? <ListGroup>{call}</ListGroup> : null}
      {clearable || failure ? (
        <div className="flex flex-col gap-2">
          {clearable ? (
            <>
              <ListGroup>
                <button
                  type="button"
                  onClick={clear}
                  className="flex min-h-[3.25rem] w-full items-center justify-center gap-2 px-4 font-medium text-danger transition-colors duration-150 ease-calm hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent [&_svg]:size-5"
                >
                  <Trash2 aria-hidden="true" />
                  {clearLabel}
                </button>
              </ListGroup>
              <p className="px-1 text-ink-2 text-sm">{clearHint}</p>
            </>
          ) : null}
          {failure ? (
            <p role="alert" className="px-1 text-base text-danger">
              {t(
                failure === "noAccess" ||
                  failure === "viewOnly" ||
                  failure === "changed" ||
                  failure === "notYet"
                  ? failure
                  : "failed",
              )}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
