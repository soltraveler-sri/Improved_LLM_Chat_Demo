/**
 * Structured audit telemetry for verifying fixes from UNIFIED_V1_AUDIT.md
 *
 * Every log entry has:
 * - fix: which audit root cause this verifies (e.g., "5.1", "5.2")
 * - event: what happened (e.g., "codex_ingestion_complete")
 * - data: relevant values for diagnosis
 * - ts: ISO timestamp
 *
 * Server-side: logs go to console.log with [AUDIT_TEL] prefix (visible in Vercel)
 * Client-side: logs go to console.log AND accumulate in window.__AUDIT_TEL__
 *              for batch flush to /api/telemetry
 */

export interface AuditTelemetryEntry {
  fix: string
  event: string
  data: Record<string, unknown>
  ts: string
  side: "client" | "server"
}

// ---------------------------------------------------------------------------
// Server-side telemetry (for API routes — goes to Vercel logs)
// ---------------------------------------------------------------------------

export function logAuditServer(
  fix: string,
  event: string,
  data: Record<string, unknown>
): void {
  const entry: AuditTelemetryEntry = {
    fix,
    event,
    data,
    ts: new Date().toISOString(),
    side: "server",
  }
  console.log(`[AUDIT_TEL] ${JSON.stringify(entry)}`)
}

// ---------------------------------------------------------------------------
// Client-side telemetry (for React components)
// ---------------------------------------------------------------------------

// Extend window to carry the telemetry buffer
declare global {
  interface Window {
    __AUDIT_TEL__?: AuditTelemetryEntry[]
  }
}

export function logAuditClient(
  fix: string,
  event: string,
  data: Record<string, unknown>
): void {
  const entry: AuditTelemetryEntry = {
    fix,
    event,
    data,
    ts: new Date().toISOString(),
    side: "client",
  }
  console.log(`[AUDIT_TEL] ${JSON.stringify(entry)}`)

  // Accumulate in window buffer for batch retrieval
  if (typeof window !== "undefined") {
    if (!window.__AUDIT_TEL__) {
      window.__AUDIT_TEL__ = []
    }
    window.__AUDIT_TEL__.push(entry)
  }
}

/**
 * Flush accumulated client telemetry to the server endpoint.
 * Call this before navigating away or at end of test session.
 * Returns the entries that were flushed.
 */
export async function flushAuditTelemetry(): Promise<AuditTelemetryEntry[]> {
  if (typeof window === "undefined" || !window.__AUDIT_TEL__?.length) {
    return []
  }

  const entries = [...window.__AUDIT_TEL__]
  window.__AUDIT_TEL__ = []

  try {
    await fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    })
  } catch {
    // Put entries back if flush fails
    window.__AUDIT_TEL__ = [...entries, ...(window.__AUDIT_TEL__ || [])]
  }

  return entries
}

/**
 * Get all accumulated client telemetry without flushing.
 * Useful for console inspection: JSON.stringify(window.__AUDIT_TEL__, null, 2)
 */
export function getAuditTelemetry(): AuditTelemetryEntry[] {
  if (typeof window === "undefined") return []
  return window.__AUDIT_TEL__ || []
}
