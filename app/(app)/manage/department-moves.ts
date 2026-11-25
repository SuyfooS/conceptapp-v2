/**
 * The departments editor's choices, with no React (accessibility, part 6):
 * where a department's people are shown, which way it can still move, and
 * where its name is found again once "ביטול" brought it back.
 */

/**
 * From a tablet up a department's people sit beside the list, the one
 * chosen marked current; on a phone they open in a sheet. Tailwind's `md`
 * as the CSS has it, in rem, so a larger default font size moves the
 * choice with the layout.
 */
export const PEOPLE_BESIDE = "(min-width: 48rem)";

/**
 * Which way the department at `index` of `count` can still move: none past
 * an end, and none for one not in the list. A move button that can't is
 * still reached and read, as unavailable, so the focus stays on it as its
 * department reaches the end.
 */
export function movesOf(
  index: number,
  count: number,
): { up: boolean; down: boolean } {
  const inList = index >= 0 && index < count;
  return { up: inList && index > 0, down: inList && index < count - 1 };
}

/** The attribute each department's name field carries: its key (`departmentName`). */
export const DEPARTMENT_NAME = "data-department-name";

/** A CSS string's own characters, so any key reads as itself in a selector. */
const cssString = (text: string) =>
  text.replace(/["\\]/g, "\\$&").replace(/\n/g, "\\a ");

/**
 * The name field of the department with this key: where the focus goes
 * once "ביטול" brought a removed department back, in its place.
 */
export function departmentName(key: string): string {
  return `[${DEPARTMENT_NAME}="${cssString(key)}"]`;
}
