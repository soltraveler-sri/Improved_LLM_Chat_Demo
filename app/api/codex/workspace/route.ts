import { NextRequest, NextResponse } from "next/server"
import { getCodexStore } from "@/lib/codex"

/**
 * Helper to get demo_uid from cookies
 */
function getDemoUid(request: NextRequest): string | null {
  return request.cookies.get("demo_uid")?.value ?? null
}

/**
 * GET /api/codex/workspace - Get the current workspace snapshot
 */
export async function GET(request: NextRequest) {
  const demoUid = getDemoUid(request)

  if (!demoUid) {
    return NextResponse.json(
      { error: "No demo_uid cookie found" },
      { status: 401 }
    )
  }

  try {
    const store = getCodexStore()
    const workspace = await store.getWorkspace(demoUid)

    return NextResponse.json({ workspace })
  } catch (error) {
    console.error("[GET /api/codex/workspace] Error:", error)
    return NextResponse.json(
      { error: "Failed to get workspace" },
      { status: 500 }
    )
  }
}
