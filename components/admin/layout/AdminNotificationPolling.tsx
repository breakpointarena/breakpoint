'use client'

import { useAdminNotificationPolling } from '@/lib/hooks/useAdminNotificationPolling'

export function AdminNotificationPolling() {
  useAdminNotificationPolling()
  return null // This component doesn't render anything
}
