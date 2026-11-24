/**
 * Where the builder puts the keyboard's focus once what held it went: a
 * person's "+" or "×" in the shift's sheet, which goes with them as they go
 * on or off the shift, and the dock's button after a draft saved or a week
 * published. Selectors, read where the focus goes (`focusFirst`), and when
 * it goes after a write (`placeAfterWrite`), so the tests stand in for the
 * page.
 */

/** The line that says where the week stands: a draft, saved, published. */
export const BUILDER_STATUS = "[data-builder-status]";

/** Sharing the week, in the dock's place once it is out with nothing new. */
export const SHARE_WEEK = "[data-share-week]";

/** The sheet's lists of people: who is on the shift, and who could be. */
export type PeopleList =
  | "assigned"
  | "available"
  | "noAnswer"
  | "unavailable"
  | "away"
  | "busy";

/** A person's button in the sheet: putting them on, or taking them off. */
export type PersonPress = "add" | "remove";

/** Where the clock has put the open shift: begun (`now`), or over. */
export type ShiftStage = "now" | "over";

/** A value as it stands between a selector's double quotes. */
const quoted = (value: string) => `"${value.replace(/["\\]/g, "\\$&")}"`;

/**
 * The line in the sheet that says the open shift has begun or is over
 * (`data-running-line`, with its stage), once the clock has moved it on from
 * `stage`, where the sheet stood as it was drawn (null: not begun). Then the
 * clock took the person's button away, not a press, and that line says why;
 * never the line of the stage the sheet already stood at, as a press under
 * way takes a button away too.
 */
export const runningLineAfter = (stage: ShiftStage | null) =>
  stage === null
    ? "[data-running-line]"
    : `[data-running-line]:not([data-running-line=${quoted(stage)}])`;

/** A list's heading in the sheet (`SheetSection`'s `mark`). */
export const listHeading = (list: PeopleList) =>
  `[data-sheet-heading=${quoted(list)}]`;

/** The "+" (`add`) or "×" (`remove`) of a person in the sheet. */
export const personButton = (press: PersonPress, userId: string) =>
  `[data-${press}-person=${quoted(userId)}]`;

/**
 * Where the focus goes once a person's "+" or "×" went with them: the same
 * button of the next person after them in the same list (`people`, in the
 * order shown), then that list's heading, then the headings of the lists
 * after it (`then`), the first of them still on screen. A list left empty
 * is no longer drawn, its heading with it. First their own button, should
 * it be drawn again: a press takes it away for good, but the sheet draws
 * its people again as the clock reaches the shift, and the focus then stays
 * on the person it was on, not on the next one, whom Enter would then put
 * on or take off. Where the clock took every such button away (all on it
 * kept as the shift begins, nobody joining once it is over), the line that
 * says so comes before the headings (`runningLineAfter`, from the `stage`
 * the sheet was drawn at), so the reason is heard.
 */
export function afterPerson(
  press: PersonPress,
  people: readonly string[],
  userId: string,
  list: PeopleList,
  then: readonly PeopleList[] = [],
  stage: ShiftStage | null = null,
): string[] {
  const at = people.indexOf(userId);
  const next = at < 0 ? [] : people.slice(at + 1);
  return [
    personButton(press, userId),
    ...next.map((id) => personButton(press, id)),
    runningLineAfter(stage),
    listHeading(list),
    ...then.map(listHeading),
  ];
}

/**
 * Where the focus goes after a write the toast says is done, when the
 * pressed button took it along (the builder starts again from the new
 * reading): after a week's first publish to sharing it, which took the
 * dock's place; else, a draft saved or changes published, to the line that
 * says where the week stands.
 */
export function afterWrite(firstPublish: boolean): readonly string[] {
  return firstPublish ? [SHARE_WEEK, BUILDER_STATUS] : [BUILDER_STATUS];
}

/**
 * The write the focus was last placed after (`afterWrite`): its stamp, and
 * whether its own reading was still to come then.
 */
export type PlacedAfterWrite = { at: string; waiting: boolean };

/**
 * Whether the focus is placed after the write the toast says is done (its
 * stamp, `writtenAt`; null for no such toast), and what to note if so. Once
 * for each write, and once more should its own reading come after the toast
 * (`waiting` was true when it was placed, and no longer is): the builder
 * starts again from that reading, and the line that had the focus goes with
 * the old board. Never for a reading after that (another manager's write),
 * nor for the same write seen again (a screen shown again from a hidden
 * <Activity>). Null: the focus stays where it is.
 */
export function placeAfterWrite(
  seen: PlacedAfterWrite | null,
  writtenAt: string | null,
  waiting: boolean,
): PlacedAfterWrite | null {
  if (writtenAt === null) return null;
  if (seen?.at === writtenAt && (!seen.waiting || waiting)) return null;
  return { at: writtenAt, waiting };
}
