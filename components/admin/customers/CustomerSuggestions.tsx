'use client'

import { useEffect, useId, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { searchWalkInCustomers } from '@/app/(admin)/admin/bookings/actions'
import {
  CUSTOMER_SUGGESTION_MIN_DIGITS,
  phoneDigits,
  type CustomerSuggestion,
} from '@/lib/customers/suggestions'

/**
 * Existing customers, offered while the desk types a phone number.
 *
 * Every counter screen starts the same way: type ten digits, press the button,
 * and a returning customer's profile loads. That is one keystroke short of
 * useless when the number is being said out loud and a digit is misheard - the
 * exact lookup finds nobody, the registration form opens, and somebody who has
 * been coming for a year is signed up again under a number one digit wrong.
 * `get_or_create_customer` then keeps filing their bookings correctly against
 * the *other* row, so nothing ever looks broken.
 *
 * Split into a hook and a panel rather than one component because the screens
 * that need it do not agree on what the input looks like - the walk-in form has
 * a +91 prefix inside a tall rounded field, the food order has a plain input
 * with the button beside it - and only the behaviour is worth sharing.
 */

export interface CustomerSuggestionsState {
  suggestions: CustomerSuggestion[]
  open: boolean
  highlighted: number
  listId: string
  setHighlighted: (index: number) => void
  pick: (suggestion: CustomerSuggestion) => void
  /** Spread onto the phone `<input>`: keyboard, focus and the ARIA wiring. */
  inputProps: {
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
    onFocus: () => void
    onBlur: () => void
    autoComplete: 'off'
    role: 'combobox'
    'aria-expanded': boolean
    'aria-controls': string
    'aria-activedescendant': string | undefined
  }
}

export function useCustomerSuggestions({
  phone,
  enabled = true,
  onPick,
}: {
  phone: string
  /** False while another step owns the screen, e.g. the registration fields. */
  enabled?: boolean
  onPick: (suggestion: CustomerSuggestion) => void
}): CustomerSuggestionsState {
  const listId = useId()
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([])
  /** Held apart from the list so picking one can close it without emptying it. */
  const [open, setOpen] = useState(false)
  /** Keyboard position in the list; -1 is the input itself. */
  const [highlighted, setHighlighted] = useState(-1)

  /**
   * Debounced rather than fired per keystroke: the last four digits of a number
   * arrive in about as many hundred milliseconds, and searching on each of them
   * is four queries to show the answer to the last one.
   *
   * `stale` is not an optimisation. Without it the answer to "98765" can land
   * after the answer to "987654" and put the shorter, wider list back on screen
   * under a longer number - so every run disowns its own result the moment the
   * field changes again.
   */
  useEffect(() => {
    if (!enabled) return

    const digits = phoneDigits(phone)
    if (digits.length < CUSTOMER_SUGGESTION_MIN_DIGITS) {
      setSuggestions([])
      setHighlighted(-1)
      return
    }

    let stale = false
    const timer = setTimeout(async () => {
      const result = await searchWalkInCustomers(digits)
      if (stale) return

      setSuggestions(result.customers || [])
      setOpen(true)
      setHighlighted(-1)
    }, 250)

    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [phone, enabled])

  const pick = (suggestion: CustomerSuggestion) => {
    setSuggestions([])
    setHighlighted(-1)
    setOpen(false)
    onPick(suggestion)
  }

  /**
   * Arrows and Enter, because this is a counter and hands stay on the keyboard.
   *
   * Enter with a row highlighted must not also submit the form: the form's own
   * Enter means "look up the number as typed", which is the opposite of picking
   * somebody else's.
   */
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      const next = highlighted + delta
      // Off either end goes back to the input, where typing another digit is
      // the more likely next move than wrapping round the list.
      setHighlighted(next < -1 || next >= suggestions.length ? -1 : next)
      return
    }

    if (event.key === 'Enter' && highlighted >= 0) {
      event.preventDefault()
      pick(suggestions[highlighted])
      return
    }

    if (event.key === 'Escape') {
      setOpen(false)
      setHighlighted(-1)
    }
  }

  return {
    suggestions,
    open,
    highlighted,
    listId,
    setHighlighted,
    pick,
    inputProps: {
      onKeyDown,
      onFocus: () => {
        if (suggestions.length > 0) setOpen(true)
      },
      // Safe to close on blur because the rows are taken on mousedown with the
      // focus change prevented, so picking one never blurs the field.
      onBlur: () => setOpen(false),
      // Autocomplete off, or the browser's own saved-value dropdown covers this
      // one - two lists of numbers over the same field, one of which is other
      // people's.
      autoComplete: 'off',
      role: 'combobox',
      'aria-expanded': open && suggestions.length > 0,
      'aria-controls': listId,
      'aria-activedescendant': highlighted >= 0 ? `${listId}-${highlighted}` : undefined,
    },
  }
}

/**
 * The matches, as a panel under the field rather than a dropdown over it.
 *
 * Floating, the list sat in the gap between the number and the button next to it
 * and read as clutter between two things staff were already using - and the rows
 * ended up a thumb's width from a button that does something else. In flow it
 * gets the room to be read: one customer per row, name above the number, and the
 * button moves down out of the way rather than being covered.
 */
export function CustomerSuggestions({
  state,
  typedPhone,
}: {
  state: CustomerSuggestionsState
  /** What is in the field, so the digits that matched can be dimmed. */
  typedPhone: string
}) {
  if (!state.open || state.suggestions.length === 0) return null

  const matched = phoneDigits(typedPhone).length

  return (
    <div className="space-y-2 rounded-xl border border-primary/30 bg-[var(--background)] p-3 animate-in fade-in slide-in-from-top-1 duration-150">
      <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-primary">
        <ShieldCheck className="h-3.5 w-3.5" />
        {state.suggestions.length === 1
          ? '1 existing profile'
          : `${state.suggestions.length} existing profiles`}
      </p>

      <ul id={state.listId} role="listbox" aria-label="Matching customers" className="space-y-1.5">
        {state.suggestions.map((suggestion, index) => (
          <li key={suggestion.id} role="none">
            <button
              type="button"
              id={`${state.listId}-${index}`}
              role="option"
              aria-selected={index === state.highlighted}
              // Mouse *down*, not click: the input's blur fires first otherwise
              // and the row is gone before the press lands on it.
              onMouseDown={(event) => {
                event.preventDefault()
                state.pick(suggestion)
              }}
              onMouseEnter={() => state.setHighlighted(index)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                index === state.highlighted
                  ? 'border-primary bg-primary/10'
                  : 'border-zinc-900 bg-[var(--surface)] hover:border-zinc-700'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-black text-white">
                  {suggestion.name || 'Unnamed customer'}
                </span>
                <span className="mt-0.5 block font-mono text-xs tracking-wider text-secondary-content">
                  {/* The digits already typed are the ones that matched; what
                      the desk is checking is the rest, so those stay bright. */}
                  <span className="text-zinc-600">+91 {suggestion.phone.slice(0, matched)}</span>
                  {suggestion.phone.slice(matched)}
                </span>
              </span>
              <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-primary">
                Use
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="text-[11px] leading-relaxed text-muted-content">
        Pick one to load their details, or keep typing the full number.
      </p>
    </div>
  )
}
