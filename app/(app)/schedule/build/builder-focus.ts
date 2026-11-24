/**
 * Where the builder puts the keyboard's focus once what held it went: a
 * person's "+" or "×" in the shift's sheet, which goes with them as they go
 * on or off the shift, and the dock's button after a draft saved or a week
 * published. Selectors only, read where the focus goes (`focusFirst`), so the
 * tests stand in for the page.
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

/** A value as it stands between a selector's double quotes. */
const quoted = (value: string) => `"${value.replace(/["\\]/g, "\\$&")}"`;

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
 * is no longer drawn, its heading with it.
 */
export function afterPerson(
  press: PersonPress,
  people: readonly string[],
  userId: string,
  list: PeopleList,
  then: readonly PeopleList[] = [],
): string[] {
  const at = people.indexOf(userId);
  const next = at < 0 ? [] : people.slice(at + 1);
  return [
    ...next.map((id) => personButton(press, id)),
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
