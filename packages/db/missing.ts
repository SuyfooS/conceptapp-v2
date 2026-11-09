/**
 * A database function the project doesn't have yet (PostgREST's PGRST202, or
 * Postgres's 42883): code that calls it can ship before its migration reaches
 * a project, and falls back to what the app did before. Any other error is
 * still the caller's to throw.
 */
export function isMissingFunction(error: { code?: string } | null): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

/**
 * A column the project doesn't have yet (Postgres's 42703, as PostgREST passes
 * it on, for a table's own columns and an embedded one's): code that reads it
 * can ship before its migration, and reads what it read before. Any other
 * error is still the caller's to throw.
 */
export function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === "42703";
}
