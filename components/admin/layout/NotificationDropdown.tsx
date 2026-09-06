'use client'

import {
  useNotifications,
  notificationHref,
  type Notification,
} from '@/lib/contexts/NotificationContext'
import { CheckCheck, Gamepad2, PackageX, UtensilsCrossed, ExternalLink, Bell } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface NotificationDropdownProps {
  onClose: () => void
}

export function NotificationDropdown({ onClose }: NotificationDropdownProps) {
  const { notifications, markAsRead, markAllAsRead } = useNotifications()

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id)

    // A stock alert goes to the menu, not to a booking it does not have.
    const href = notificationHref(notification)
    if (href) window.open(href, '_blank')

    onClose()
  }

  return (
    <div className="absolute right-0 top-12 w-96 bg-[var(--background)] border border-zinc-800 rounded-lg shadow-[0_0_40px_rgba(184,134,11,0.15)] z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <h3 className="text-sm font-black uppercase text-white">Notifications</h3>
        {notifications.length > 0 && (
          <button
            onClick={markAllAsRead}
            className="text-xs text-primary hover:text-primary-hover font-bold flex items-center gap-1 transition-colors"
          >
            <CheckCheck className="h-3 w-3" />
            Mark all read
          </button>
        )}
      </div>

      {/* Notification List */}
      <div className="max-h-[400px] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center mx-auto mb-3">
              <Bell className="h-6 w-6 text-muted-content" />
            </div>
            <p className="text-sm text-secondary-content font-medium">No notifications yet</p>
            <p className="text-xs text-muted-content mt-1">You'll see updates here when customers book or add food</p>
          </div>
        ) : (
          notifications.map((notification) => {
            const Icon =
              notification.type === 'booking'
                ? Gamepad2
                : notification.type === 'stock'
                  ? PackageX
                  : UtensilsCrossed

            return (
              <button
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`w-full p-4 border-b border-zinc-800/50 hover:bg-[var(--surface-hover)] transition-colors text-left group ${
                  !notification.read ? 'bg-primary/5' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    notification.type === 'booking'
                      ? 'bg-primary/20 text-primary'
                      : notification.type === 'stock'
                        ? 'bg-rose-500/20 text-rose-400'
                        : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-black text-white">{notification.title}</p>
                      {!notification.read && (
                        <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1"></span>
                      )}
                    </div>
                    <p className="text-xs text-muted-content mt-1">{notification.message}</p>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-muted-content font-mono">
                        {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
                      </p>
                      <ExternalLink className="h-3 w-3 text-muted-content group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
