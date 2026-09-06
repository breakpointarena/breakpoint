import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  /**
   * Server actions verify their own caller, so they skip this gate.
   *
   * A server action POSTs to the page it was called from, which means it used
   * to pay for two auth round trips: this middleware's getUser(), and then
   * requireStaff()'s. On a database a hundred milliseconds away that doubled
   * the fixed cost of every admin operation, and the dashboard issues four at
   * once.
   *
   * Skipping is safe because it is not what protects them: every one of the
   * admin server actions calls requireStaff() or requireAdmin() itself, which
   * is the check that actually decides. Redirecting a POST here was never
   * useful either - a login page returned to an action call is not something
   * the customer or the staff member ever sees.
   *
   * IF YOU ADD AN ADMIN SERVER ACTION, IT MUST CALL requireStaff() OR
   * requireAdmin(). There is no longer a middleware backstop behind it.
   */
  if (request.method === 'POST' && request.headers.has('next-action')) {
    return response
  }

  // Create a Supabase client configured to use cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser(), not getSession(): getSession() decodes whatever is in the cookie
  // without guaranteeing it is revalidated against the auth server, so it must
  // never be the basis of an access decision. getUser() verifies the token.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Role comes from app_metadata only. user_metadata is writable by the user
  // via supabase.auth.updateUser(), so a staff account could otherwise promote
  // itself to admin. An account with no explicit staff role is not staff -
  // there is deliberately no default, because public signup means a stranger
  // can hold a perfectly valid Supabase session.
  const role = user?.app_metadata?.role
  const isStaff = role === 'admin' || role === 'staff'

  const isAdminRoute = request.nextUrl.pathname.startsWith('/admin')
  const isLoginPage = request.nextUrl.pathname === '/admin/login'

  // Anyone who is not staff is sent to the login page, signed in or not.
  if (isAdminRoute && !isLoginPage && !isStaff) {
    const loginUrl = new URL('/admin/login', request.url)
    loginUrl.searchParams.set('redirectTo', request.nextUrl.pathname)
    if (user) loginUrl.searchParams.set('error', 'not-staff')
    return NextResponse.redirect(loginUrl)
  }

  // Already signed in as staff and heading to the login page - go to the panel.
  // Straight to the dashboard: /admin is not a page, only a server redirect to
  // it, so sending them there would cost a second navigation and a second run of
  // this same auth check. The login form's own success redirect targets the
  // dashboard directly for the same reason.
  if (isLoginPage && isStaff) {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url))
  }

  return response
}

// Configure which routes to run middleware on
export const config = {
  matcher: [
    '/admin/:path*',
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static media, fonts and the manifest
     *
     * The media and font extensions are excluded because this middleware ends
     * in an unconditional getUser(), which is a round trip to the auth server.
     * A <video> is fetched as a run of range requests, so every one of them was
     * paying for an auth lookup that decides nothing: the redirect below only
     * ever fires for /admin, and that is matched by its own entry above
     * whatever the extension. On the dev server the same requests were also
     * coming back 503 and being retried, which is what put a burst of failed
     * video requests on the landing page.
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp4|webm|mp3|wav|woff|woff2|ttf|otf)$).*)',
  ],
}
