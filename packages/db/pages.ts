/**
 * The most rows PostgREST returns for one request: `max_rows` in
 * supabase/config.toml, and hosted Supabase's default. Past it a read is cut
 * short without an error, so a read that can pass it asks page by page.
 */
export const PAGE_ROWS = 1000;

/**
 * Every row of a read, page by page: `page(first, last)` asks for rows
 * `first` to `last` (as `.range()` takes them) of a query with a stable order,
 * and pages are asked for until one comes back short.
 */
export async function allPages<Row>(
  page: (
    first: number,
    last: number,
  ) => PromiseLike<{ data: Row[] | null; error: unknown }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let first = 0; ; first += PAGE_ROWS) {
    const { data, error } = await page(first, first + PAGE_ROWS - 1);
    if (error) throw error;
    const got = data ?? [];
    rows.push(...got);
    if (got.length < PAGE_ROWS) return rows;
  }
}
