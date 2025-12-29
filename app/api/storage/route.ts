import { NextResponse } from "next/server"
import { getStorageInfo } from "@/lib/store"

/**
 * GET /api/storage - Get current storage status
 *
 * Returns information about the storage backend:
 * - type: "kv" | "memory" | "error"
 * - available: boolean
 * - message: string (human-readable status)
 */
export async function GET() {
  try {
    const info = getStorageInfo()
    return NextResponse.json(info)
  } catch (error) {
    console.error("[GET /api/storage] Error:", error)
    return NextResponse.json(
      {
        type: "error",
        available: false,
        message:
          error instanceof Error ? error.message : "Failed to get storage info",
      },
      { status: 500 }
    )
  }
}
