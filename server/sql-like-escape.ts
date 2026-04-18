/**
 * Escape `%`, `_`, and `\` for PostgreSQL LIKE/ILIKE when using `ESCAPE '\\'`.
 * @see https://www.postgresql.org/docs/current/functions-matching.html#FUNCTIONS-LIKE
 */
export function escapeSqlLikePatternFragment(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** `%…%` pattern for case-insensitive substring match (combine with `ESCAPE '\\'`). */
export function ilikeContainsPattern(userInput: string): string {
  const t = userInput.trim();
  if (!t) return "%%";
  return `%${escapeSqlLikePatternFragment(t)}%`;
}
