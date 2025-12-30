"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Global error boundary for the Next.js App Router
 *
 * This prevents white-screen crashes by catching client-side exceptions
 * and displaying a friendly error UI with recovery options.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to console for debugging
    console.error("[GlobalError] Client-side exception:", error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="rounded-full bg-destructive/10 p-4 mb-6">
          <AlertTriangle className="h-10 w-10 text-destructive" />
        </div>

        <h2 className="text-2xl font-semibold mb-2">Something went wrong</h2>

        <p className="text-muted-foreground mb-6">
          An unexpected error occurred. This has been logged for debugging.
        </p>

        {/* Debug hint - safe to show, no sensitive info */}
        <p className="text-xs text-muted-foreground mb-6 font-mono bg-muted/50 px-3 py-2 rounded-md">
          Check browser console for details.
          {error.digest && (
            <>
              <br />
              Error ID: {error.digest}
            </>
          )}
        </p>

        <div className="flex gap-3">
          <Button onClick={reset} variant="default" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
          <Button
            onClick={() => (window.location.href = "/")}
            variant="outline"
          >
            Go Home
          </Button>
        </div>
      </div>
    </div>
  )
}
