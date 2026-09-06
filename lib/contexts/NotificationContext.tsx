'use client'

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react'

export interface Notification {
  id: string
  /** `stock` is about the menu rather than about any one order. */
  type: 'booking' | 'food' | 'stock'
  title: string
  message: string
  /** Absent when the event is not about a booking - a menu item running out. */
  bookingId?: string
  bookingNumber?: string
  /**
   * Where clicking it should go. Defaults to the booking named above, which is
   * where every notification led back when they were all about bookings.
   */
  href?: string
  timestamp: Date
  read: boolean
}

/** Where a notification takes you when it is clicked. */
export function notificationHref(notification: Notification): string | null {
  if (notification.href) return notification.href
  if (notification.bookingId) return `/admin/bookings?id=${notification.bookingId}`
  return null
}

interface NotificationContextType {
  notifications: Notification[]
  unreadCount: number
  /**
   * `id` is optional but should be given whenever the event has a natural key -
   * `booking:<uuid>` for an order. Two sources announce the same events (the
   * walk-in screens the moment they confirm, the poller 30 seconds later, and
   * both again after a reload), and a stable id is what stops one event being
   * listed three times.
   */
  addNotification: (
    notification: Omit<Notification, 'id' | 'timestamp' | 'read'> & {
      id?: string
      /**
       * When the thing being announced actually happened. Defaults to now, which
       * is right for a screen reporting what it just did and wrong for the poller
       * sweeping up the shift - without it a booking from this morning was listed
       * as "less than a minute ago", and the toast manager could not tell history
       * from a live arrival.
       */
      timestamp?: Date
    }
  ) => void
  markAsRead: (notificationId: string) => void
  markAllAsRead: () => void
  clearNotifications: () => void
  /** True once the stored list has been read back, so consumers can tell a
   *  genuinely new arrival from one that was already on screen before a reload. */
  hydrated: boolean
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

/**
 * Window in which the same event is treated as already announced, for callers
 * that pass no id. Kept as a backstop only; anything with a natural key is
 * deduplicated exactly.
 */
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000

/** Where the list survives a reload. Per browser, which is per staff device. */
const STORAGE_KEY = 'bp-admin-notifications'

/**
 * Where "I have seen this" survives a reload, separately from the list itself.
 *
 * Keeping the flag only on the stored notification was not enough: the list is
 * capped, and anything pushed off the end came back as a brand new arrival the
 * next time the poller swept it up - marked unread, because nothing remembered
 * otherwise. An id that has been read stays read even when the notification
 * carrying it has been and gone.
 */
const READ_STORAGE_KEY = 'bp-admin-notifications-read'

/** Room for far more receipts than notifications, since they are only ids. */
const MAX_READ_IDS = 300

/** One id somebody has already read, and when they read it. */
export interface ReadReceipt {
  id: string
  at: number
}

/**
 * Adds ids to the read set, newest first, pruned the same way the list is.
 *
 * Pure, so the rule that matters - a notification read once stays read across a
 * reload, an eviction and a re-announcement - can be asserted directly.
 */
export function rememberRead(
  prev: ReadReceipt[],
  ids: string[],
  now: number = Date.now()
): ReadReceipt[] {
  if (ids.length === 0) return prev

  const incoming = new Set(ids)
  const cutoff = now - MAX_AGE_MS

  return [
    ...ids.map(id => ({ id, at: now })),
    ...prev.filter(receipt => !incoming.has(receipt.id)),
  ]
    .filter(receipt => receipt.at >= cutoff)
    .slice(0, MAX_READ_IDS)
}

/**
 * How many to keep. The old cap of ten was fine for a list that started empty on
 * every reload; one that persists needs enough room to still hold this morning's
 * orders by the afternoon.
 */
const MAX_STORED = 30

/** Anything older than this is history, not a notification. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000

type StoredNotification = Omit<Notification, 'timestamp'> & { timestamp: string }

/**
 * Reads the list back, discarding anything malformed.
 *
 * JSON has no Date, so timestamps come back as strings and have to be revived -
 * the dropdown calls `formatDistanceToNow` on them and the toast manager reads
 * `getTime()`, both of which throw on a string.
 */
function loadStored(): Notification[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const cutoff = Date.now() - MAX_AGE_MS

    return (parsed as StoredNotification[])
      .filter(entry => entry && typeof entry.id === 'string' && typeof entry.timestamp === 'string')
      .map(entry => ({ ...entry, timestamp: new Date(entry.timestamp) }))
      .filter(entry => !Number.isNaN(entry.timestamp.getTime()) && entry.timestamp.getTime() >= cutoff)
      .slice(0, MAX_STORED)
  } catch {
    // A corrupt or unreadable store must not take the admin panel down with it.
    return []
  }
}

/** Reads the read set back, discarding anything malformed or expired. */
function loadReadReceipts(): ReadReceipt[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(READ_STORAGE_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const cutoff = Date.now() - MAX_AGE_MS

    return (parsed as ReadReceipt[])
      .filter(
        entry =>
          entry &&
          typeof entry.id === 'string' &&
          typeof entry.at === 'number' &&
          entry.at >= cutoff
      )
      .slice(0, MAX_READ_IDS)
  } catch {
    return []
  }
}

/**
 * Decides what the list becomes when one more notification arrives.
 *
 * Pure and exported so the rules that matter - one event announced once, across
 * two sources and across a reload - can be asserted directly rather than only
 * observed by clicking around the admin panel. See `npm run test:notifications`.
 *
 * Returns `prev` unchanged when the event is already known, which also spares
 * React a re-render and the store a needless write.
 */
export function mergeNotification(
  prev: Notification[],
  incoming: Notification,
  now: number = Date.now()
): Notification[] {
  // An explicit id is an exact answer to "have we already said this?" and holds
  // across reloads, where a time window cannot.
  if (prev.some(existing => existing.id === incoming.id)) return prev

  // Backstop for callers without one: same booking, same headline, moments
  // apart. A later, genuinely different event on that booking ("Food Added"
  // after "New Booking") carries a different title and still comes through.
  //
  // It asks "is this the same booking again?", so it has nothing to say about an
  // event that is not about a booking at all. Applied to those, two menu items
  // running out within two minutes of each other would match on a bookingId they
  // both lack and a title they both share, and only the first would be heard.
  const cutoff = now - DUPLICATE_WINDOW_MS
  const alreadyAnnounced =
    incoming.bookingId !== undefined &&
    prev.some(
      existing =>
        existing.bookingId === incoming.bookingId &&
        existing.title === incoming.title &&
        existing.timestamp.getTime() >= cutoff
    )

  if (alreadyAnnounced) return prev

  /**
   * Sorted before the cap is applied, because arrival order is not age order.
   *
   * The poller reads bookings newest-first and announces them in that order, so
   * prepending each one blindly left the list oldest-first - and the cap then
   * threw away the newest thirty and kept this morning's. Every reload replayed
   * the sweep and evicted a different thirty, which is what kept dragging
   * already-dismissed notifications back onto the screen.
   */
  return [incoming, ...prev]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, MAX_STORED)
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [hydrated, setHydrated] = useState(false)

  /**
   * A ref rather than state: `addNotification` is memoised with no dependencies
   * so every caller keeps the same function identity, and it has to read the
   * current receipts rather than the ones captured when it was created.
   */
  const readReceiptsRef = useRef<ReadReceipt[]>([])
  const readIdsRef = useRef<Set<string>>(new Set())

  const persistReceipts = useCallback((receipts: ReadReceipt[]) => {
    readReceiptsRef.current = receipts
    readIdsRef.current = new Set(receipts.map(receipt => receipt.id))

    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(receipts))
    } catch {
      // A full or blocked store is not worth interrupting anyone over.
    }
  }, [])

  // Read back after mount rather than in a lazy initialiser: the server renders
  // this with an empty list, so seeding from localStorage during the first render
  // would make the client's markup disagree with it.
  useEffect(() => {
    const receipts = loadReadReceipts()
    readReceiptsRef.current = receipts
    readIdsRef.current = new Set(receipts.map(receipt => receipt.id))

    const stored = loadStored()
    if (stored.length > 0) {
      // The receipt is the authority: a notification restored as unread that
      // somebody has already dismissed stays dismissed.
      setNotifications(
        stored.map(entry =>
          entry.read || readIdsRef.current.has(entry.id) ? { ...entry, read: true } : entry
        )
      )
    }
    setHydrated(true)
  }, [])

  // Write back only after the read, or the empty first render would immediately
  // overwrite the very list being restored.
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications))
    } catch {
      // A full or blocked store is not worth interrupting anyone over.
    }
  }, [notifications, hydrated])

  const addNotification = useCallback(
    (
      notification: Omit<Notification, 'id' | 'timestamp' | 'read'> & {
        id?: string
        timestamp?: Date
      }
    ) => {
      const stamp =
        notification.timestamp && !Number.isNaN(notification.timestamp.getTime())
          ? notification.timestamp
          : new Date()

      const id = notification.id || `notif-${Date.now()}-${Math.random()}`

      const newNotification: Notification = {
        ...notification,
        id,
        timestamp: stamp,
        // Announced again after being evicted from a full list, or after a
        // reload replayed the sweep that found it: whoever dismissed it did
        // not need telling twice.
        read: readIdsRef.current.has(id),
      }

      setNotifications(prev => mergeNotification(prev, newNotification))
    },
    []
  )

  const markAsRead = useCallback(
    (notificationId: string) => {
      persistReceipts(rememberRead(readReceiptsRef.current, [notificationId]))
      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, read: true } : n))
      )
    },
    [persistReceipts]
  )

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => {
      persistReceipts(rememberRead(readReceiptsRef.current, prev.map(n => n.id)))
      return prev.map(n => ({ ...n, read: true }))
    })
  }, [persistReceipts])

  /**
   * Clearing empties the list but keeps the receipts: the sweep that found
   * these orders runs again in thirty seconds, and they must not come back
   * demanding attention that has already been paid.
   */
  const clearNotifications = useCallback(() => {
    setNotifications(prev => {
      persistReceipts(rememberRead(readReceiptsRef.current, prev.map(n => n.id)))
      return []
    })
  }, [persistReceipts])

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearNotifications,
        hydrated,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider')
  }
  return context
}
