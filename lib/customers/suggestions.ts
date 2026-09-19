/**
 * Matching a customer from a half-typed phone number, at the counter.
 *
 * The walk-in desk already had an exact lookup: type all ten digits, press
 * Verify, and a returning customer's profile is loaded. That is one keystroke
 * short of useless when the customer is standing there reciting their number and
 * the person at the counter mishears a digit - the lookup says "new profile" and
 * a second row is created for somebody who has been coming for a year, under a
 * number that is one digit wrong.
 *
 * So the desk gets suggestions while it types. These two numbers are the whole
 * policy, and they live here rather than in the action because the form applies
 * the first one too: a `"use server"` module may only export async functions, so
 * a constant shared by both sides has nowhere else to sit.
 */

/**
 * Digits before anything is suggested.
 *
 * Four is enough that a match means something - the phone book at this arena is
 * thousands of rows and a two-digit prefix would return an arbitrary handful of
 * them, which is worse than nothing because staff would start reading it.
 */
export const CUSTOMER_SUGGESTION_MIN_DIGITS = 4

/**
 * How many are shown.
 *
 * Six fits under the field without the card scrolling, and a longer list is the
 * wrong answer anyway: the fix for too many matches is another digit, which the
 * customer is already saying.
 */
export const CUSTOMER_SUGGESTION_LIMIT = 6

/** What the desk sees for each match. Deliberately not the whole profile. */
export interface CustomerSuggestion {
  id: string
  name: string | null
  phone: string
}

/**
 * The ten digits of whatever was typed or pasted.
 *
 * Customers are stored as bare digits, so a pasted "+91 98765 43210" has to come
 * down to the same thing the column holds - the same normalisation
 * `lookupWalkInCustomer` does, for the same reason. Also what makes the prefix
 * safe to hand to `like`: nothing but digits survives, so no wildcard can.
 */
export function phoneDigits(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '').slice(-10)
}

/**
 * Letters before a name is searched for.
 *
 * Three, where the phone number above wants four, because the two are not the
 * same kind of guess. Four digits of a ten-digit number narrows a phone book to
 * a handful; three letters of a name is already "sree" or "pra" - enough of a
 * word to mean somebody, and the shortest thing a person at a counter will type
 * before they expect to see a result.
 */
export const CUSTOMER_NAME_MIN_CHARS = 3

/**
 * A typed name, reduced to something safe to put inside a `LIKE` pattern.
 *
 * The phone search above could hand its input straight to the database because
 * stripping it to digits left nothing a pattern could read. A name cannot do
 * that - it is free text, and `%` and `_` are wildcards. A desk that typed `%`
 * would match the entire phone book; `_` would quietly widen every search by one
 * character.
 *
 * They are removed rather than escaped on purpose. Escaping means agreeing with
 * the driver about the escape character, and PostgREST, supabase-js and SQL do
 * not obviously agree; removing them needs no such agreement and costs nothing,
 * because neither character belongs in anybody's name. Apostrophes, hyphens and
 * full stops are left exactly as they are - O'Brien and Jean-Luc are names, not
 * wildcards, and they are already parameterised against injection.
 *
 * Inner runs of whitespace collapse so that "santu  pramanik" finds the row
 * stored as "Santu pramanik".
 */
export function nameQuery(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/[%_\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
