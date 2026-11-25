/**
 * A press that leaves its screen for another, whose way back takes the
 * focus there (accessibility, part 8): the send form's press for Lists, with
 * the list just sent, and the editor's "הסרת הרשימה" for the templates, with
 * the one just removed. What was pressed went with its screen, so "ביטול"
 * is the next thing to reach, but only right after that press: a reload,
 * the address opened again, or Back to it later leaves the focus where it
 * is, and the page's announcer says the row instead. Kept in the page's own
 * memory, so a reload forgets it; one at a time, and taken once.
 */
let pressed: string | null = null;

/** Lists, right after sending this list (`?sent=`). */
export const sentArrival = (listId: string) => `sent:${listId}`;

/** The templates, right after removing this one in its editor (`?removed=`). */
export const removedArrival = (templateId: string) => `removed:${templateId}`;

/** Just before leaving for the screen that shows `arrival`. */
export function leavingFor(arrival: string): void {
  pressed = arrival;
}

/**
 * Whether the screen showing `arrival` comes right after its press. Only
 * reads, so it can be asked as the screen draws, as often as it draws.
 */
export function cameFromPress(arrival: string): boolean {
  return pressed === arrival;
}

/** The screen has drawn it: from now on it came from no press. */
export function arrivalTaken(arrival: string): void {
  if (pressed === arrival) pressed = null;
}
