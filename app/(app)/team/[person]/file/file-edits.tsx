"use client";

import type { FileGroup } from "@domain/employee-file";
import { Button } from "@ui/button";
import { StatusToast } from "@ui/status-toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { HOLD_MS } from "../../../use-held-write";
import {
  GROUP_SECTION,
  type MarkWords,
  markSaid,
  marksAfter,
  undoRefusal,
  writeOutcome,
} from "./file-edits-rules";
import type { HolderWordsKey } from "./holder-failure-words";
import type { HolderFileActions } from "./holder-file-types";

export type { MarkWords } from "./file-edits-rules";

/*
 * What a holder does in someone's open file (profile H6b-1): the account's
 * review confirmed, and a part marked "נמסר ישירות לשכר" or the mark taken
 * off, each written at once and the page drawn again by the server. The
 * provider sits above the rows that change, so its toast outlives the
 * redraw. Every word comes from the server but "ביטול" and the refusals;
 * nothing typed and no value travels (the account's moment and a group's
 * name aren't values). No fresh step-up, or the duties first, draws the
 * page again, locked or with the duties, and nothing is said. The twin,
 * which keeps nothing, goes to the state each answer draws instead. What
 * each answer means is ./file-edits-rules'.
 */

/** The twin's states for what the app does by drawing itself again. */
export type FileEditsTwin = {
  locked: string;
  /** The account confirmed. */
  confirmed: string;
  /** The account changed again meanwhile: a new one to look at. */
  moved: string;
  /** The parts marked, joined by commas, follow. */
  direct: string;
};

/** A "ביטול" the server refused: said in its part's row, under its button. */
type UndoRefused = { group: FileGroup; key: HolderWordsKey; at: number };

type Edits = {
  acknowledgeBank: HolderFileActions["acknowledgeBank"];
  /** A mark's press, its toast; the refusal's words, or null when it went. */
  mark: (
    group: FileGroup,
    marked: boolean,
    words: MarkWords,
    current: readonly FileGroup[],
  ) => Promise<string | null>;
  /** A toast, the focus on a section's heading as the button pressed goes. */
  say: (message: string, focusTo: string) => void;
  /** No fresh step-up, or the duties first: the page draws itself so. */
  redraw: (failure: "stepUp" | "ack") => void;
  undoRefused: UndoRefused | null;
  /** The person's first name, for a refusal that names them. */
  first: string;
  twin?: FileEditsTwin;
};

const FileEditsContext = createContext<Edits | null>(null);

function useEdits(): Edits {
  const edits = use(FileEditsContext);
  if (!edits) throw new Error("A file's edit outside FileEdits");
  return edits;
}

const failed = (): { ok: false; failure: "failed" } => ({
  ok: false,
  failure: "failed",
});

type Toast = { text: string; stamp: string; undo?: () => void };

/** A section's heading, which takes the focus from what went. */
function focusSection(id: string | null) {
  if (id) document.getElementById(id)?.focus({ preventScroll: true });
}

/**
 * The open file's writes: one toast for what was done, with "ביטול" for as
 * long as a held write would wait, only after a press that changed the
 * file; and a "ביטול" the server refused, said in its part's own row with
 * the way back (`DirectMark`), or in the toast when that part has no row
 * now (complete); the row stays as the server drew it.
 */
export function FileEdits({
  actions,
  first,
  twin,
  children,
}: {
  actions: Pick<HolderFileActions, "acknowledgeBank" | "markDirect">;
  first: string;
  twin?: FileEditsTwin;
  children: ReactNode;
}) {
  const t = useTranslations("app.team.file");
  const router = useRouter();
  const [toast, setToast] = useState<Toast | null>(null);
  const [undoRefused, setUndoRefused] = useState<UndoRefused | null>(null);
  /** Where the focus goes once the toast leaves holding it. */
  const back = useRef<string | null>(null);
  const [, startUndo] = useTransition();

  function redraw(failure: "stepUp" | "ack") {
    if (twin && failure === "stepUp") router.push(twin.locked);
    else router.refresh();
  }

  function say(message: string, focusTo: string, undo?: () => void) {
    setUndoRefused(null);
    back.current = focusTo;
    setToast({ text: message, stamp: `${Date.now()}`, undo });
  }

  async function mark(
    group: FileGroup,
    marked: boolean,
    words: MarkWords,
    current: readonly FileGroup[],
    undoing = false,
  ): Promise<string | null> {
    if (!undoing) setUndoRefused(null);
    const answer = await actions.markDirect(group, marked).catch(failed);
    const focusTo = GROUP_SECTION[group];
    if (answer.ok) {
      const after = answer.changed
        ? marksAfter(current, group, marked)
        : [...current];
      if (twin && answer.changed)
        router.push(`${twin.direct}${after.join(",")}`);
      const said = markSaid(words, answer.changed, undoing);
      say(
        said.text,
        focusTo,
        said.undo
          ? () =>
              startUndo(async () => {
                await mark(group, !marked, words, after, true);
              })
          : undefined,
      );
      return null;
    }
    const outcome = writeOutcome(answer);
    if (outcome.kind === "redraw") {
      redraw(outcome.failure);
      return null;
    }
    const key = outcome.kind === "refused" ? outcome.key : "failures.failed";
    if (!undoing) return t(key, { first });
    // The way back's button went with the toast: the part's row says what
    // stayed and what to press there.
    back.current = focusTo;
    if (document.querySelector(`[data-direct-mark="${group}"]`)) {
      setUndoRefused({ group, key, at: Date.now() });
    } else {
      const { reason } = undoRefusal(key, false);
      say(
        [
          t("direct.undoRefused", { group: words.group }),
          reason ? t(reason, { first }) : null,
        ]
          .filter(Boolean)
          .join(" "),
        focusTo,
      );
    }
    return null;
  }

  return (
    <FileEditsContext
      value={{
        acknowledgeBank: actions.acknowledgeBank,
        mark: (group, marked, words, current) =>
          mark(group, marked, words, current),
        say: (message, focusTo) => say(message, focusTo),
        redraw,
        undoRefused,
        first,
        twin,
      }}
    >
      <StatusToast
        message={toast?.text ?? null}
        stamp={toast?.stamp}
        duration={toast?.undo ? HOLD_MS : 4000}
        action={
          toast?.undo
            ? {
                label: t("direct.undo"),
                onClick: () => {
                  const undo = toast.undo;
                  setToast(null);
                  undo?.();
                },
              }
            : null
        }
        // The button pressed went with its row: on to "ביטול".
        focusAction={toast?.undo !== undefined}
        onFocusLeave={() => focusSection(back.current)}
      />
      {children}
    </FileEditsContext>
  );
}

/**
 * The account's review, confirmed: the open file's one main action, its
 * words by the review ("ראיתי את החשבון החדש", "בדקתי את מספר החשבון",
 * "בדקתי עם נועה, החשבון נכון") with what holding it means under it. It
 * sends the moment the screen read, as it came. Changed again meanwhile,
 * its line says so and takes the focus, and the server draws the newer
 * change under the same line (this island isn't keyed by the moment), so
 * the next press sends the newer one; confirmed by someone else meanwhile,
 * a toast says so. Once confirmed the notice goes with this button, so the
 * focus goes to the bank's heading.
 */
export function BankReviewAction({
  changedAt,
  label,
  hint,
  confirmed,
}: {
  changedAt: string;
  label: string;
  hint: string;
  /** The toast's words once it is confirmed. */
  confirmed: string;
}) {
  const t = useTranslations("app.team.file");
  const router = useRouter();
  const { acknowledgeBank, say, redraw, first, twin } = useEdits();
  const [pending, start] = useTransition();
  const [line, setLine] = useState<{ text: string; at: number } | null>(null);
  const said = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (line) said.current?.focus({ preventScroll: true });
  }, [line]);

  function press() {
    start(async () => {
      const answer = await acknowledgeBank(changedAt).catch(failed);
      const outcome = writeOutcome(answer);
      switch (outcome.kind) {
        case "done":
        case "settled":
          // The review goes with this button as the page is drawn again.
          setLine(null);
          say(
            outcome.kind === "done" ? confirmed : t("review.settled"),
            GROUP_SECTION.bank,
          );
          focusSection(GROUP_SECTION.bank);
          if (twin) router.push(twin.confirmed);
          return;
        case "redraw":
          redraw(outcome.failure);
          return;
        case "refused":
          setLine({ text: t(outcome.key, { first }), at: Date.now() });
          if (twin && !answer.ok && answer.failure === "moved") {
            router.push(twin.moved);
          }
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 border-line border-b px-4 py-3">
      {line ? (
        <p
          ref={said}
          role="alert"
          tabIndex={-1}
          className="font-medium text-danger outline-none"
        >
          {line.text}
        </p>
      ) : null}
      <Button
        size="lg"
        loading={pending}
        onClick={press}
        className="w-full md:w-auto md:self-start"
      >
        {label}
      </Button>
      <p className="text-ink-2 text-sm">{hint}</p>
    </div>
  );
}

/**
 * "סימון שנמסר ישירות לשכר" on a missing part (or "סימון ש{העסק} בחר קרן"
 * for a pension whose day passed), "הסרת הסימון" on a marked one: quiet,
 * under the part's row, written at once with "ביטול" in the toast when the
 * press changed the file. A refusal is said under the button, which stays;
 * so is a "ביטול" refused after this part's press, with this button as the
 * way back, taking the focus so it is heard where the part is.
 */
export function DirectMark({
  group,
  marked,
  label,
  hint,
  words,
  current,
}: {
  group: FileGroup;
  /** What the press does: mark it, or take the mark off. */
  marked: boolean;
  label: string;
  hint?: string;
  words: MarkWords;
  /** The parts marked now, for the twin's address. */
  current: readonly FileGroup[];
}) {
  const t = useTranslations("app.team.file");
  const { mark, undoRefused, first } = useEdits();
  const [pending, start] = useTransition();
  const [refusal, setRefusal] = useState<string | null>(null);
  const said = useRef<HTMLParagraphElement>(null);
  const undone = undoRefused?.group === group ? undoRefused : null;

  useEffect(() => {
    if (undone) said.current?.focus();
  }, [undone]);

  const undoLine = (() => {
    if (!undone) return null;
    const { wayBack, reason } = undoRefusal(undone.key, true);
    return [
      t("direct.undoRefused", { group: words.group }),
      wayBack ? t("direct.undoWayBack", { label }) : null,
      reason ? t(reason, { first }) : null,
    ]
      .filter(Boolean)
      .join(" ");
  })();
  const line = undoLine ?? refusal;

  return (
    <div
      data-direct-mark={group}
      className="flex flex-col items-start gap-1 pt-2"
    >
      <Button
        variant={marked ? "secondary" : "ghost"}
        loading={pending}
        onClick={() =>
          start(async () => {
            setRefusal(await mark(group, marked, words, current));
          })
        }
      >
        {label}
      </Button>
      {hint ? <p className="text-ink-2 text-sm">{hint}</p> : null}
      {line ? (
        <p
          ref={said}
          role="alert"
          tabIndex={-1}
          className="font-medium text-danger text-sm outline-none"
        >
          {line}
        </p>
      ) : null}
    </div>
  );
}
