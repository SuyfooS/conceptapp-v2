/**
 * The paste's text as the import screen edits it: where a line is, for
 * "תיקון השורה", and the text without some lines, for "הסרת השורה". Lines
 * are numbered from 1 as pasted, as @domain/people-import numbers them; a
 * name line and its number line go together (`last`).
 */

export type LineSpan = { line: number; last?: number };

/** Where each line starts, and where it ends before its line break. */
function linesOf(text: string): { start: number; end: number }[] {
  const lines: { start: number; end: number }[] = [];
  let start = 0;
  for (const found of text.matchAll(/\r?\n/g)) {
    lines.push({ start, end: found.index });
    start = found.index + found[0].length;
  }
  lines.push({ start, end: text.length });
  return lines;
}

/**
 * The characters of lines `span.line` to `span.last` in `text`, without the
 * last one's line break, for `setSelectionRange`; null for a line the text
 * no longer has.
 */
export function lineRange(
  text: string,
  span: LineSpan,
): { start: number; end: number } | null {
  const lines = linesOf(text);
  const first = lines[span.line - 1];
  const last = lines[(span.last ?? span.line) - 1];
  if (!first || !last) return null;
  return { start: first.start, end: last.end };
}

/** `text` without the lines of `spans`, its line breaks as "\n". */
export function withoutLines(text: string, spans: readonly LineSpan[]): string {
  const gone = new Set<number>();
  for (const span of spans) {
    for (let line = span.line; line <= (span.last ?? span.line); line++) {
      gone.add(line);
    }
  }
  return text
    .split(/\r?\n/)
    .filter((_, index) => !gone.has(index + 1))
    .join("\n");
}
