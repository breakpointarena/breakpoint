'use client'

import { useEffect, useRef } from 'react'
import { useNotifications, notificationHref, Notification } from '@/lib/contexts/NotificationContext'
import { Gamepad2, PackageX, UtensilsCrossed, X } from 'lucide-react'
import { toast as sonnerToast } from 'sonner'
import { playNotificationSound, preloadNotificationSound } from '@/lib/utils/notificationSound'

/**
 * How recent an event has to be to be worth a toast and a chime.
 *
 * Comfortably longer than the 30-second poll, so a genuine arrival is never
 * missed, and far shorter than the poller's backfill window.
 */
const ANNOUNCE_MAX_AGE_MS = 3 * 60 * 1000

/**
 * Whether an event is recent enough to interrupt someone.
 *
 * Pure and exported so the rule can be asserted rather than clicked at: the
 * poller reaches back over the shift, and history must fill the bell in silence
 * while a live order still chimes. Judged on when the order was placed, not on
 * when this tab first heard about it.
 */
export function shouldAnnounce(
  notification: { read: boolean; timestamp: Date },
  now: number = Date.now()
): boolean {
  if (notification.read) return false
  return now - notification.timestamp.getTime() <= ANNOUNCE_MAX_AGE_MS
}

export function NotificationToastManager() {
  const { notifications, hydrated } = useNotifications()
  const shownNotificationsRef = useRef<Set<string>>(new Set())
  const seededRef = useRef(false)

  useEffect(() => {
    // Preload notification sound on mount
    preloadNotificationSound()
  }, [])

  useEffect(() => {
    // Nothing is new until the stored list has been read back.
    if (!hydrated) return

    /**
     * Whatever was restored from the last session is not news.
     *
     * This ref is per mount, so once notifications survive a reload every unread
     * one looked new again - a page refresh fired a stack of toasts and a chime
     * for each, for orders staff had already seen. Recording them as shown
     * without announcing them leaves the bell holding its history while only
     * genuine arrivals interrupt anyone.
     */
    if (!seededRef.current) {
      seededRef.current = true
      notifications.forEach((notification) => shownNotificationsRef.current.add(notification.id))
      return
    }

    // Show toast for new unread notifications
    notifications.forEach((notification) => {
      if (notification.read || shownNotificationsRef.current.has(notification.id)) return

      /**
       * History goes in the bell quietly; only what just happened interrupts.
       *
       * The poller reaches back over the shift so nothing goes unannounced, which
       * on a browser with no stored list means a dozen orders arrive at once. Each
       * would have raised its own toast and chime for something that happened
       * hours ago. Freshness is judged on when the order was placed, not when
       * this tab first heard about it.
       */
      shownNotificationsRef.current.add(notification.id)

      if (!shouldAnnounce(notification)) return

      showNotificationToast(notification)
      // Play notification sound
      playNotificationSound()
    })
  }, [notifications, hydrated])

  return null // This component doesn't render anything
}

function showNotificationToast(notification: Notification) {
  const Icon =
    notification.type === 'booking'
      ? Gamepad2
      : notification.type === 'stock'
        ? PackageX
        : UtensilsCrossed

  const href = notificationHref(notification)

  sonnerToast.custom(
    (t) => (
      <div
        className="relative w-full bg-gradient-to-br from-[#111] via-zinc-950 to-[#111] border-2 border-primary/40 rounded-xl p-4 shadow-[0_0_40px_rgba(184,134,11,0.3)] cursor-pointer hover:border-primary/60 transition-all"
        onClick={() => {
          // A stock alert goes to the menu, not to a booking it does not have.
          if (href) window.open(href, '_blank')
          sonnerToast.dismiss(t)
        }}
      >
        {/* Pinned to the card's top-right corner, matching the styled toasts */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            sonnerToast.dismiss(t)
          }}
          aria-label="Dismiss notification"
          className="absolute right-2 top-2 rounded-lg p-1 text-secondary-content transition-colors hover:bg-white/5 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {/* pr-6 keeps the message clear of the close button */}
        <div className="flex items-start gap-3 pr-6">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              notification.type === 'booking'
                ? 'bg-primary/20 text-primary'
                : notification.type === 'stock'
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'bg-amber-500/20 text-amber-400'
            }`}
          >
            <Icon className="h-5 w-5" />
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-black text-white mb-1">{notification.title}</h4>
            <p className="text-xs text-muted-content">{notification.message}</p>
          </div>
        </div>
      </div>
    ),
    {
      duration: 8000, // 8 seconds
      position: 'bottom-right',
    }
  )
}
