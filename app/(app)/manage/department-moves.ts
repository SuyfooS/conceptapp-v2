/**
 * The departments editor's choices, with no React (accessibility, part 6):
 * where a department's people are shown, and which way it can still move.
 */

/**
 * From a tablet up a department's people sit beside the list, the one
 * chosen marked current; on a phone they open in a sheet. Tailwind's `md`.
 */
export const PEOPLE_BESIDE = "(min-width: 768px)";

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
