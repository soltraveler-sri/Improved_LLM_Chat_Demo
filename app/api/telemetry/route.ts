import { NextRequest, NextResponse } from "next/server"
import type { AuditTelemetryEntry } from "@/lib/telemetry"

/**
 * POST /api/telemetry — receives flushed client-side audit telemetry
 * and re-logs it server-side so it appears in Vercel function logs.
 *
 * GET /api/telemetry — returns any entries received in the current
 * server process lifetime (useful for local dev, not durable in serverless).
 */

// In-memory buffer for the GET convenience endpoint (process-lifetime only)
const serverBuffer: AuditTelemetryEntry[] = []

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const entries: AuditTelemetryEntry[] = body.entries || []

    for (const entry of entries) {
      // Re-log each entry so it appears in Vercel function logs
      console.log(`[AUDIT_TEL] ${JSON.stringify(entry)}`)
      serverBuffer.push(entry)
    }

    // Cap buffer at 500 entries to avoid memory leaks in long-running dev
    if (serverBuffer.length > 500) {
      serverBuffer.splice(0, serverBuffer.length - 500)
    }

    return NextResponse.json({
      received: entries.length,
      totalBuffered: serverBuffer.length,
    })
  } catch (error) {
    console.error("[POST /api/telemetry] Error:", error)
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }
}

export async function GET() {
  return NextResponse.json({
    entries: serverBuffer,
    count: serverBuffer.length,
  })
}
