/**
 * The most rows PostgREST returns for one request: `max_rows` in
 * supabase/config.toml, and hosted Supabase's default. Past it a read is cut
 * short without an error, so a read that can pass it asks page by page,
 * ordered by its key last so no row falls between two pages, or says beside
 * it why it can't (`// bounded: …`). tooling/bounded-reads.test.ts keeps it
 * that way.
 */
export const PAGE_ROWS = 1000;

/** Ids one `in` filter takes, so a read's address stays short (about 3.7 KB). */
export const IDS_PER_READ = 100;

/** `list` in parts of at most `size`. */
export function inParts<T>(list: readonly T[], size = IDS_PER_READ): T[][] {
  const parts: T[][] = [];
  for (let at = 0; at < list.length; at += size) {
    parts.push(list.slice(at, at + size));
  }
  return parts;
}

type Page<Row, E> = PromiseLike<{ data: Row[] | null; error: E | null }>;

/**
 * Every row of a read, page by page: `page(first, last)` asks for rows
 * `first` to `last` (as `.range()` takes them) of a query with a stable order,
 * and pages are asked for until one comes back short.
 */
export async function allPages<Row>(
  page: (first: number, last: number) => Page<Row, unknown>,
): Promise<Row[]> {
  const read = await readAllPages(page);
  if (read.data === null) throw read.error;
  return read.data;
}

/**
 * `allPages`, answering as one read does: `{ data, error: null }`, or a
 * page's error as `{ data: null, error }` without throwing and without asking
 * for more, for the reads that tell a missing table or column
 * (`isMissingTable`, `isMissingColumn`) from a failure.
 */
export async function readAllPages<Row, E>(
  page: (first: number, last: number) => Page<Row, E>,
): Promise<{ data: Row[]; error: null } | { data: null; error: E }> {
  const rows: Row[] = [];
  for (let first = 0; ; first += PAGE_ROWS) {
    const { data, error } = await page(first, first + PAGE_ROWS - 1);
    if (error) return { data: null, error };
    const got = data ?? [];
    rows.push(...got);
    if (got.length < PAGE_ROWS) return { data: rows, error: null };
  }
}

/**
 * Every row for `ids`, read in parts of IDS_PER_READ and each part page by
 * page (`page(part, first, last)`), in the parts' order. Nothing is asked
 * for none; a page's error is thrown.
 */
export async function allPagesIn<Id, Row>(
  ids: readonly Id[],
  page: (part: Id[], first: number, last: number) => Page<Row, unknown>,
): Promise<Row[]> {
  const read = await readAllPagesIn(ids, page);
  if (read.data === null) throw read.error;
  return read.data;
}

/** `allPagesIn`, answering as one read does (`readAllPages`). */
export async function readAllPagesIn<Id, Row, E>(
  ids: readonly Id[],
  page: (part: Id[], first: number, last: number) => Page<Row, E>,
): Promise<{ data: Row[]; error: null } | { data: null; error: E }> {
  const parts = await Promise.all(
    inParts(ids).map((part) =>
      readAllPages((first, last) => page(part, first, last)),
    ),
  );
  const rows: Row[] = [];
  for (const part of parts) {
    if (part.data === null) return part;
    rows.push(...part.data);
  }
  return { data: rows, error: null };
}
