import { FILE_GROUPS, type FileGroup } from "@domain/employee-file";
import { directGroupsAfter } from "@domain/file-holders";
import { type HolderWordsKey, holderWordsOf } from "./holder-failure-words";
import type { HolderWriteAnswer } from "./holder-file-types";

/*
 * What the open file's islands do with a holder's write (profile H6b-1),
 * apart from React so it is tested on its own: which section's heading the
 * focus goes back to, what each answer means for the screen, and the twin's
 * address once a mark is pressed.
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
 * The parts marked once a press went, as the twin's address carries them
 * (`direct`, then the parts joined by commas): the twin keeps nothing, so
 * its address is the file's state.
 */
export function marksAfter(
  current: readonly FileGroup[],
  group: FileGroup,
  marked: boolean,
): FileGroup[] {
  return directGroupsAfter(current, group, marked, FILE_GROUPS) ?? [...current];
}
