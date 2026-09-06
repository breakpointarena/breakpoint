'use client'

import { useEffect, useRef } from 'react'
import { Provider } from 'react-redux'
import { makeStore, AppStore } from './store'
import { restoreBooking } from './slices/bookingSlice'
import { readBookingSnapshot, writeBookingSnapshot } from './bookingStorage'

export default function StoreProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<AppStore | null>(null)
  if (!storeRef.current) {
    storeRef.current = makeStore()
  }

  /**
   * Carry the booking across reloads.
   *
   * The restore runs in an effect rather than as `makeStore` preloaded state
   * because the server renders this tree with an empty store: seeding the client's
   * first render from sessionStorage would print a different slot picker than the
   * HTML it is hydrating. Effects run child-first, so a page's redirect guard sees
   * the store one tick before this fills it - hence `hydrated`, which those guards
   * wait for.
   */
  useEffect(() => {
    const store = storeRef.current!

    store.dispatch(restoreBooking(readBookingSnapshot()))

    let lastBooking = store.getState().booking
    return store.subscribe(() => {
      const { booking } = store.getState()
      if (booking === lastBooking) return
      lastBooking = booking
      writeBookingSnapshot(booking)
    })
  }, [])

  return <Provider store={storeRef.current}>{children}</Provider>
}
