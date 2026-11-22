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
import { GROUP_SECTION, marksAfter, writeOutcome } from "./file-edits-rules";
import type { HolderFileActions, HolderWriteAnswer } from "./holder-file-types";

/*
 * What a holder does in someone's open file (profile H6b-1): the account's
 * review confirmed, and a part marked "נמסר ישירות לשכר" or the mark taken
 * off, each written at once and the page drawn again by the server. The
 * provider sits above the rows that change, so its toast and its line
 * outlive the redraw. Every word comes from the server but "ביטול" and the
 * refusals; nothing typed and no value travels (the account's moment and a
 * group's name aren't values). No fresh step-up, or the duties first, draws
 * the page again, locked or with the duties, and nothing is said. The twin,
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

/** What a mark's press said, and what its "ביטול" says. */
export type MarkWords = { done: string; undone: string };

type Edits = {
  acknowledgeBank: HolderFileActions["acknowledgeBank"];
  /** A mark's press, its toast with "ביטול"; the refusal's words, or null when it went. */
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
  twin?: FileEditsTwin;
};

const FileEditsContext = createContext<Edits | null>(null);

function useEdits(): Edits {
  const edits = use(FileEditsContext);
  if (!edits) throw new Error("A file's edit outside FileEdits");
  return edits;
}

const failed = (): HolderWriteAnswer => ({ ok: false, failure: "failed" });

type Toast = { text: string; stamp: string; undo?: () => void };

/** A section's heading, which takes the focus from what went. */
function focusSection(id: string | null) {
  if (id) document.getElementById(id)?.focus({ preventScroll: true });
}

/**
 * The open file's writes: one toast for what was done (with "ביטול" for a
 * mark, for as long as a held write would wait), and one line for an undo
 * the server refused, which takes the focus so it is heard; the row stays
 * as the server drew it.
 */
export function FileEdits({
  actions,
  twin,
  children,
}: {
  actions: Pick<HolderFileActions, "acknowledgeBank" | "markDirect">;
  twin?: FileEditsTwin;
  children: ReactNode;
}) {
  const t = useTranslations("app.team.file");
  const router = useRouter();
  const [toast, setToast] = useState<Toast | null>(null);
  const [refused, setRefused] = useState<{ text: string; at: number } | null>(
    null,
  );
  const line = useRef<HTMLParagraphElement>(null);
  /** Where the focus goes once the toast leaves holding it. */
  const back = useRef<string | null>(null);
  const [, startUndo] = useTransition();

  useEffect(() => {
    if (refused) line.current?.focus();
  }, [refused]);

  function redraw(failure: "stepUp" | "ack") {
    if (twin && failure === "stepUp") router.push(twin.locked);
    else router.refresh();
  }

  function say(message: string, focusTo: string, undo?: () => void) {
    setRefused(null);
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
    const outcome = writeOutcome(
      await actions.markDirect(group, marked).catch(failed),
    );
    const focusTo = GROUP_SECTION[group];
    switch (outcome.kind) {
      case "done": {
        const after = marksAfter(current, group, marked);
        if (twin) router.push(`${twin.direct}${after.join(",")}`);
        say(
          undoing ? words.undone : words.done,
          focusTo,
          undoing
            ? undefined
            : () =>
                startUndo(async () => {
                  await mark(group, !marked, words, after, true);
                }),
        );
        return null;
      }
      case "redraw":
        redraw(outcome.failure);
        return null;
      default: {
        const text = t(
          outcome.kind === "refused" ? outcome.key : "failures.failed",
        );
        if (undoing) {
          // The way back's button went with the toast: the line says why,
          // and takes the focus.
          back.current = focusTo;
          setRefused({ text, at: Date.now() });
        }
        return text;
      }
    }
  }

  return (
    <FileEditsContext
      value={{
        acknowledgeBank: actions.acknowledgeBank,
        mark: (group, marked, words, current) =>
          mark(group, marked, words, current),
        say: (message, focusTo) => say(message, focusTo),
        redraw,
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
      {refused ? (
        <p
          ref={line}
          role="alert"
          tabIndex={-1}
          className="px-1 font-medium text-danger outline-none md:max-w-2xl"
        >
          {refused.text}
        </p>
      ) : null}
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
  const { acknowledgeBank, say, redraw, twin } = useEdits();
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
          setLine({ text: t(outcome.key), at: Date.now() });
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
 * under the part's row, written at once with "ביטול" in the toast. A
 * refusal is said under the button, which stays.
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
  const { mark } = useEdits();
  const [pending, start] = useTransition();
  const [refusal, setRefusal] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1 pt-2">
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
      {refusal ? (
        <p role="alert" className="font-medium text-danger text-sm">
          {refusal}
        </p>
      ) : null}
    </div>
  );
}
