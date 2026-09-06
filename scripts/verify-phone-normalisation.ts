/**
 * Phone numbers starting with 91 must survive country-code stripping.
 *
 * `validatePhoneNumber` used `replace(/^\+?91/, '')`, which took the leading 91
 * off any number that began with it. 91 is a live Indian mobile prefix, so
 * 9123456789 became 23456789 and was rejected as "must be 10 digits" - every
 * customer on a 91xxxxxxxx number was locked out of logging in, and the failure
 * looked like a typo rather than a bug.
 *
 * Run: npm run test:phone
 */

import { validatePhoneNumber } from '../lib/services/msg91'

type Case = { input: string; expect: string | null; why: string }

const CASES: Case[] = [
  // The regression.
  { input: '9123456789', expect: '9123456789', why: 'mobile that begins with 91' },
  { input: '9198765432', expect: '9198765432', why: 'another 91-prefixed mobile' },

  // Country codes that really are country codes.
  { input: '+919876543210', expect: '9876543210', why: '+91 prefix' },
  { input: '919876543210', expect: '9876543210', why: '91 followed by a full 10 digits' },
  { input: '919123456789', expect: '9123456789', why: '91 country code on a 91-prefixed mobile' },

  // Formatting the form may pass through.
  { input: '+91 98765 43210', expect: '9876543210', why: 'spaces' },
  { input: '98765-43210', expect: '9876543210', why: 'dashes' },
  { input: '(98765) 43210', expect: '9876543210', why: 'brackets' },
  { input: '9876543210', expect: '9876543210', why: 'plain 10 digits' },

  // Must still be refused.
  { input: '5123456789', expect: null, why: 'invalid Indian mobile prefix' },
  { input: '12345', expect: null, why: 'too short' },
  { input: '98765432101', expect: null, why: 'too long' },
  { input: '', expect: null, why: 'empty' },
]

let failures = 0

for (const { input, expect, why } of CASES) {
  const result = validatePhoneNumber(input)
  const actual = result.isValid ? result.cleanPhone : null
  const pass = actual === expect

  if (!pass) failures++
  console.log(
    `  ${pass ? 'ok  ' : 'FAIL'}  ${JSON.stringify(input).padEnd(18)} -> ${String(actual).padEnd(12)} ` +
      `${pass ? '' : `(expected ${expect}) `}${why}`
  )
}

if (failures > 0) {
  console.error(`\n${failures} case${failures > 1 ? 's' : ''} failed.\n`)
  process.exit(1)
}

console.log(`\nAll ${CASES.length} phone cases pass.\n`)
