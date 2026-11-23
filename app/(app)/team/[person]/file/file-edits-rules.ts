import { FILE_GROUPS, type FileGroup } from "@domain/employee-file";
import { type HolderWordsKey, holderWordsOf } from "./holder-failure-words";
import type { HolderWriteAnswer } from "./holder-file-types";

/*
 * What the open file's islands do with a holder's write (profile H6b-1),
 * apart from React so it is tested on its own: which section's heading the
 * focus goes back to, what each answer means for the screen, what a mark's
 * toast says and when it offers "ביטול", what a refused "ביטול" says in its
 * part's row, and the twin's address once a mark is pressed.
 */

/** Each part's section, by its heading's id: where the focus goes back to. */
export const GROUP_SECTION: Record<FileGroup, string> = {
  identity: "file-identity",
  address: "file-contact",
  bank: "file-bank",
  pension: "file-pension",
};

/**
 * A write's answer, for the screen: it went; no fresh step-up or the duties
 * first, which the page answers by drawing itself again, saying nothing;
 * the account confirmed by someone else meanwhile, which goes with the
 * review and is said in a toast; or a refusal said where it was pressed.
 */
export type WriteOutcome =
  | { kind: "done" }
  | { kind: "redraw"; failure: "stepUp" | "ack" }
  | { kind: "settled" }
  | { kind: "refused"; key: HolderWordsKey };

export function writeOutcome(answer: HolderWriteAnswer): WriteOutcome {
  if (answer.ok) return { kind: "done" };
  switch (answer.failure) {
    case "stepUp":
    case "ack":
      return { kind: "redraw", failure: answer.failure };
    case "settled":
      return { kind: "settled" };
    default:
      return {
        kind: "refused",
        key: holderWordsOf(answer.failure, "write") ?? "failures.failed",
      };
  }
}

/**
 * What a mark's press says, built on the server for the part's row: the
 * part's name; what the press did (`done`) and what its "ביטול" did
 * (`undone`); and each of those found already so, another holder's press
 * first (`already`, `alreadyUndone`).
 */
export type MarkWords = {
  group: string;
  done: string;
  undone: string;
  already: string;
  alreadyUndone: string;
};

/**
 * The toast once a mark's press (or its "ביטול") went, and whether it
 * offers "ביטול": only a press that changed the file does. One that found
 * the part already so says that instead, with nothing to undo, so no undo
 * takes back another holder's mark; an undo that found its change already
 * taken back says that too.
 */
export function markSaid(
  words: MarkWords,
  changed: boolean,
  undoing: boolean,
): { text: string; undo: boolean } {
  if (undoing) {
    return { text: changed ? words.undone : words.alreadyUndone, undo: false };
  }
  return { text: changed ? words.done : words.already, undo: changed };
}

/**
 * A refused "ביטול", said in its part's own row after "„ביטול” לא עבר…":
 * the button there now (`hasButton`) as the way back when pressing again
 * may help (something didn't work), or else why it can't (the person off
 * the team, a business switched meanwhile, …). Something that didn't work
 * with no button there (the part complete) says nothing more.
 */
export function undoRefusal(
  key: HolderWordsKey,
  hasButton: boolean,
): { wayBack: boolean; reason: HolderWordsKey | null } {
  const retry = key === "failures.failed";
  return { wayBack: retry && hasButton, reason: retry ? null : key };
}

/**
 * The parts marked once a press went, as the twin's address carries them
 * (`direct`, then the parts joined by commas, in FILE_GROUPS' order): the
 * twin keeps nothing, so its address is the file's state.
 */
export function marksAfter(
  current: readonly FileGroup[],
  group: FileGroup,
  marked: boolean,
): FileGroup[] {
  return FILE_GROUPS.filter((each) =>
    each === group ? marked : current.includes(each),
  );
}
