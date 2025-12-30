import { NextResponse } from "next/server"
import { getStorageInfo } from "@/lib/store"

/**
 * GET /api/storage - Get current storage status
 *
 * Returns information about the storage backend:
 * - storageType: "kv" | "memory" (for backwards compatibility)
 * - kvConfigured: boolean
 * - mode: "redis" | "memory" (actual storage mode)
 * - backend: "upstash" | "vercel_kv" | "memory" (detected backend)
 * - detectedEnvKeys: string[] (env var names found, no values)
 * - warning?: string (human-readable warning if using memory store)
 */
export async function GET() {
  try {
    const info = getStorageInfo()
    return NextResponse.json(info)
  } catch (error) {
    console.error("[GET /api/storage] Error:", error)
    return NextResponse.json(
      {
        storageType: "memory",
        kvConfigured: false,
        mode: "memory",
        backend: "memory",
        detectedEnvKeys: [],
        warning:
          error instanceof Error ? error.message : "Failed to get storage info",
      },
      { status: 500 }
    )
  }
}
