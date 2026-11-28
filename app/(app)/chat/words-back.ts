/**
 * A message's words given back to the field, as it met a page from the
 * release before (closing the pilot, PR 1b), with when it was written (its
 * `at`, an ISO time).
 */
export type GivenBack = { at: string; body: string };

/**
 * The field once `item`'s words come back to it, and the words given back
 * so far, for the next one. Two messages sent before the first came back
 * return one after the other, so each goes in among those given back
 * before it, in the order they were written, and everything comes before
 * what was written since the first came back, on a line of its own. A
 * field emptied meanwhile starts again with this one alone; one whose
 * words given back were changed meanwhile (so where they end is no longer
 * known) takes this one after all it holds, which keeps them in the order
 * written.
 */
export function wordsBack(
  field: string,
  given: readonly GivenBack[],
  item: GivenBack,
): { field: string; given: GivenBack[] } {
  if (field.trim() === "") return { field: item.body, given: [item] };
  const before = given.map((one) => one.body).join("\n");
  if (before === "") {
    return { field: `${item.body}\n${field}`, given: [item] };
  }
  if (field === before || field.startsWith(`${before}\n`)) {
    // Sorted by when each was written; one written at the same moment
    // follows those already there.
    const now = [...given, item].sort((a, b) =>
      a.at < b.at ? -1 : a.at > b.at ? 1 : 0,
    );
    const words = now.map((one) => one.body).join("\n");
    return { field: `${words}${field.slice(before.length)}`, given: now };
  }
  const changed = `${field}\n${item.body}`;
  return { field: changed, given: [{ at: item.at, body: changed }] };
}
