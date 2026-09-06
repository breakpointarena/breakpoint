'use client'

import { useState, useEffect, FormEvent, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Eye, EyeOff, Lock, Mail, Gamepad2 } from 'lucide-react'
import { BreakpointLoader } from "@/components/shared/BreakpointLoader";

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  /**
   * Straight to the dashboard, not to /admin.
   *
   * `/admin` is not a page - it is a server `redirect()` to this same place - so
   * defaulting to it made every sign-in navigate twice, and both hops run the
   * middleware's auth check. The middleware's own redirect already puts a real
   * destination in `redirectTo` when it bounces someone, so this default is only
   * ever used by someone arriving at the login page directly.
   */
  const redirectTo = searchParams.get('redirectTo') || '/admin/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // A signed-in account without a staff role is bounced back here by the
  // middleware. Without this they would sign in "successfully" and land on the
  // login page again with no explanation, looking like a broken redirect loop.
  useEffect(() => {
    if (searchParams.get('error') === 'not-staff') {
      toast.error('Access Denied', {
        description: 'This account does not have staff access to the admin panel.',
      })
    }
  }, [searchParams])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      console.log('Attempting login with:', { email, passwordLength: password.length })

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      console.log('Login response:', { data: !!data, error })

      if (error) {
        console.error('Login error:', error)
        toast.error('Login Failed', {
          description: error.message || 'Invalid email or password',
        })
        return
      }

      if (data.session) {
        const userRole = data.user?.user_metadata?.role || data.user?.app_metadata?.role || 'admin'
        const roleName = userRole === 'admin' ? 'Admin' : 'Staff'

        toast.success(`Welcome back, ${roleName}!`, {
          description: 'Redirecting to dashboard...',
        })
        router.push(redirectTo)
        router.refresh()
      }
    } catch (error) {
      toast.error('Login Failed', {
        description: 'An unexpected error occurred',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-black">
      {/* Animated background effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-black to-black" />
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-gradient-to-r from-primary/20 to-primary/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-gradient-to-l from-orange-600/15 to-primary/15 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgxNjgsODUsMjQ3LDAuMDMpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30" />

      <div className="relative z-10 w-full max-w-md px-4">
        <Card className="border-primary/20 bg-gradient-to-br from-zinc-900/95 via-black/95 to-zinc-900/95 backdrop-blur-xl shadow-[0_0_50px_rgba(184,134,11,0.15)]">
          <CardHeader className="space-y-4 text-center pb-6">
            {/* Logo/Icon */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary via-amber-400 to-primary rounded-2xl blur-xl opacity-50 animate-pulse" />
                <div className="relative bg-gradient-to-br from-zinc-900 to-[var(--background)] p-4 rounded-2xl border border-primary/30">
                  <Image
                    src="/bp_logo.png"
                    alt="Breakpoint Arena"
                    width={64}
                    height={64}
                    className="w-16 h-16 object-contain rounded-lg"
                    priority
                  />
                </div>
              </div>
            </div>

            <div>
              <CardTitle className="text-3xl font-black text-transparent bg-gradient-to-r from-white via-amber-100 to-white bg-clip-text mb-2">
                Admin Portal
              </CardTitle>
              <CardDescription className="text-muted-content">
                Sign in to access the dashboard
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Input */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-300 font-semibold">
                  Email Address <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-content" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@breakpointarena.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                    className="pl-10 bg-[var(--background)]/50 border-zinc-800 focus:border-primary/50 focus:ring-primary/20 text-white placeholder:text-muted-content h-12"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-zinc-300 font-semibold">
                  Password <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-content" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="pl-10 pr-10 bg-[var(--background)]/50 border-zinc-800 focus:border-primary/50 focus:ring-primary/20 text-white placeholder:text-muted-content h-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-content hover:text-primary transition-colors"
                    disabled={isLoading}
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={isLoading || !email.trim() || !password.trim()}
                className="w-full h-12 bg-gradient-to-r from-primary via-amber-400 to-primary text-black font-black text-sm uppercase tracking-wider hover:shadow-[0_0_30px_rgba(184,134,11,0.5)] hover:scale-[1.02] transition-all duration-300 relative overflow-hidden group"
              >
                {isLoading && (
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                )}
                <span className="relative z-10">
                  {isLoading ? 'Signing In...' : 'Sign In'}
                </span>
              </Button>
            </form>

            {/* Footer Note */}
            <div className="mt-6 text-center">
              <p className="text-xs text-muted-content">
                Session expires after 12 hours of inactivity
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Breakpoint Arena Text */}
        <div className="mt-8 text-center">
          <p className="text-muted-content text-sm font-bold tracking-wider">
            BREAKPOINT ARENA
          </p>
          <p className="text-zinc-700 text-xs mt-1">
            Admin Dashboard v1.0
          </p>
        </div>
      </div>
    </div>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-black"><BreakpointLoader size="lg" /></div>}>
      <LoginForm />
    </Suspense>
  )
}
