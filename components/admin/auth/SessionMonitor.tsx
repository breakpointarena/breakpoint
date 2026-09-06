'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { clearDeliberateSignOut, isDeliberateSignOut } from '@/lib/auth/admin-signout'

export function SessionMonitor() {
  const router = useRouter()
  const hasShownExpiry = useRef(false)

  useEffect(() => {
    /**
     * Announce an expiry, unless the user asked for it.
     *
     * `SIGNED_OUT` is raised both when a session lapses and when somebody
     * presses Log Out, and this used to report an expiry for both - so a
     * successful logout showed "Logged Out" and "Session Expired" together.
     */
    const announceExpiry = () => {
      if (isDeliberateSignOut()) return
      if (hasShownExpiry.current) return

      hasShownExpiry.current = true
      toast.error('Session Expired', {
        description: 'Your session has expired. Please login again.',
        duration: 5000,
      })
    }

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        announceExpiry()
        router.push('/admin/login')
        router.refresh()
      }

      if (event === 'SIGNED_IN') {
        // Signed in again, so a later expiry in this tab is genuine news.
        clearDeliberateSignOut()
        hasShownExpiry.current = false
      }

      if (event === 'TOKEN_REFRESHED') {
        // Session was successfully refreshed
        console.log('Session refreshed successfully')
      }
    })

    // Check session validity on mount and periodically
    const checkSession = async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession()

      if (error || !session) {
        announceExpiry()
        router.push('/admin/login')
        router.refresh()
      }
    }

    // Check immediately
    checkSession()

    // Check every 5 minutes
    const interval = setInterval(checkSession, 5 * 60 * 1000)

    return () => {
      subscription.unsubscribe()
      clearInterval(interval)
    }
  }, [router])

  return null
}
