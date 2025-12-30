"use client"

import { useEffect } from "react"

/**
 * Global error boundary for root layout errors
 *
 * This is a special error boundary that catches errors in the root layout.
 * It must include its own <html> and <body> tags since the root layout
 * may have failed to render.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[GlobalError] Root layout exception:", error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: "#0a0a0a",
          color: "#fafafa",
          margin: 0,
          padding: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "2rem",
            maxWidth: "400px",
          }}
        >
          <div
            style={{
              fontSize: "3rem",
              marginBottom: "1rem",
            }}
          >
            ⚠️
          </div>
          <h2
            style={{
              fontSize: "1.5rem",
              fontWeight: 600,
              marginBottom: "0.5rem",
            }}
          >
            Something went wrong
          </h2>
          <p
            style={{
              color: "#a1a1aa",
              marginBottom: "1.5rem",
            }}
          >
            A critical error occurred. Check browser console for details.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: "0.75rem",
                color: "#71717a",
                fontFamily: "monospace",
                backgroundColor: "#18181b",
                padding: "0.5rem 1rem",
                borderRadius: "0.375rem",
                marginBottom: "1.5rem",
              }}
            >
              Error ID: {error.digest}
            </p>
          )}
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            <button
              onClick={reset}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "#fafafa",
                color: "#0a0a0a",
                border: "none",
                borderRadius: "0.375rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => (window.location.href = "/")}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "transparent",
                color: "#fafafa",
                border: "1px solid #27272a",
                borderRadius: "0.375rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Go Home
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
