/**
 * Helpers for gating submit buttons.
 *
 * Every form in the app marks its mandatory fields with a red star and keeps its
 * submit button disabled until they are all filled. These keep that check
 * consistent instead of each form inventing its own "is it filled" rule.
 */

/** A text field counts as filled only once it holds something other than spaces. */
export function isFilled(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/** True when every supplied field is filled. */
export function allFilled(...values: Array<string | null | undefined>): boolean {
  return values.every(isFilled)
}

/**
 * Deliberately permissive: enough to catch a typo like a missing "@", not so
 * strict that it rejects a legitimate address. The real check is whether mail to
 * it bounces, which no regex can tell us.
 */
const EMAIL_PATTERN =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/

export function isPlausibleEmail(value: string | null | undefined): boolean {
  if (!isFilled(value)) return false
  const trimmed = (value as string).trim()
  // RFC caps, so a huge string is never handed to the regex engine.
  if (trimmed.length > 254) return false
  const [local] = trimmed.split('@')
  // "@gma.com" has no local part at all - the old pattern's `[^\s@]+` looked like it
  // required one, but callers that never ran this check let such values straight
  // through, and a bare domain with no "@" was accepted elsewhere.
  if (!local || local.length > 64) return false
  return EMAIL_PATTERN.test(trimmed)
}

/**
 * An Indian mobile number, reduced to its 10 significant digits.
 *
 * Accepts what customers actually type - "+91 98765 43210", "091-9876543210",
 * "9876543210" - and returns just the digits, or null when it is not a valid Indian
 * mobile. Storing the normalised form stops one person becoming two customers under
 * two spellings of the same number.
 */
export function normalizeIndianMobile(value: string | null | undefined): string | null {
  if (!isFilled(value)) return null

  // Strip non-digits, then peel off trunk and country prefixes. Order matters:
  // "091-9876543210" carries both. A leading zero is always a trunk prefix here
  // because no Indian mobile number begins with one.
  let digits = (value as string).replace(/\D/g, '').replace(/^0+/, '')
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)

  if (digits.length !== 10) return null

  // TRAI allocates mobile numbers in the 6-9 series; 0-5 are landline and service
  // ranges and can never be a mobile. This is what rejects 0000000000.
  if (!/^[6-9]\d{9}$/.test(digits)) return null

  // One repeated digit (9999999999) is a placeholder, never a real allocation.
  if (/^(\d)\1{9}$/.test(digits)) return null

  return digits
}

/** True when the value is a valid Indian mobile number in any accepted shape. */
export function isValidIndianMobile(value: string | null | undefined): boolean {
  return normalizeIndianMobile(value) !== null
}

/** A positive number entered as text, for price/quantity style fields. */
export function isPositiveNumber(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined || value === '') return false
  const n = Number(value)
  return Number.isFinite(n) && n > 0
}

/** A non-negative number, for fields where zero is a legitimate entry. */
export function isNonNegativeNumber(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined || value === '') return false
  const n = Number(value)
  return Number.isFinite(n) && n >= 0
}
