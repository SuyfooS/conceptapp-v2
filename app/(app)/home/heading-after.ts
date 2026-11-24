/** A heading of the page's own content, under its title. */
export const SECTION_HEADINGS = "main h2, main h3";

/** `Node.DOCUMENT_POSITION_FOLLOWING`, without the browser's `Node`. */
const FOLLOWING = 4;

/**
 * The headings of the page's content that come after `anchor`, in order:
 * where a part of Today that went (a row whose "ביטול" was not pressed)
 * sends the focus, to the next section's title, so a screen reader goes on
 * from there. None without an anchor, and none inside it.
 */
export function headingsAfter(
  anchor: Pick<Node, "contains" | "compareDocumentPosition"> | null,
  doc:
    | { querySelectorAll(selectors: string): Iterable<Element> }
    | undefined = globalThis.document,
): Element[] {
  if (!anchor || !doc) return [];
  return [...doc.querySelectorAll(SECTION_HEADINGS)].filter(
    (heading) =>
      !anchor.contains(heading) &&
      (anchor.compareDocumentPosition(heading) & FOLLOWING) !== 0,
  );
}
