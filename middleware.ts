import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Middleware to set a demo user ID cookie for persistence
 *
 * This creates a simple pseudo-identity for demo purposes.
 * No real authentication - just a UUID stored in a cookie.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Check if demo_uid cookie exists
  const existingUid = request.cookies.get("demo_uid")

  if (!existingUid) {
    // Generate a new UUID for this demo user
    const newUid = crypto.randomUUID()

    // Set the cookie
    response.cookies.set("demo_uid", newUid, {
      path: "/",
      sameSite: "lax",
      // Cookie lasts 30 days
      maxAge: 60 * 60 * 24 * 30,
      // Don't require HTTPS in development
      secure: process.env.NODE_ENV === "production",
    })
  }

  return response
}

/**
 * Only run middleware on pages and API routes
 * Skip static assets and Next.js internals
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
