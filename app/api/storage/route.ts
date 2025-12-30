import { NextResponse } from "next/server"
import { getStorageInfo } from "@/lib/store"

/**
 * GET /api/storage - Get current storage status
 *
 * Returns information about the storage backend:
 * - storageType: "kv" | "memory"
 * - kvConfigured: boolean
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
        warning:
          error instanceof Error ? error.message : "Failed to get storage info",
      },
      { status: 500 }
    )
  }
}
