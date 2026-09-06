/**
 * Helpers for feeding user input into Postgres pattern matches.
 */

/**
 * Escapes a string so Postgres `LIKE`/`ILIKE` treats it as a literal.
 *
 * `%`, `_` and `\` are wildcards/escapes in a LIKE pattern, so passing raw user
 * input to `.ilike()` turns an exact lookup into a search. For a promo code that
 * means sending `%` matches whatever code happens to be in the table, and prefix
 * probing (`A%`, `AB%`, ...) enumerates the lot - without ever knowing a code.
 *
 * Backslash first, or it would re-escape the escapes added after it.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}
