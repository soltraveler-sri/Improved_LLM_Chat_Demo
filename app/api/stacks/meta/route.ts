import { NextRequest, NextResponse } from "next/server"
import { getChatStore } from "@/lib/store/store"

/**
 * Helper to get demo_uid from cookies
 */
function getDemoUid(request: NextRequest): string | null {
  return request.cookies.get("demo_uid")?.value ?? null
}

/**
 * GET /api/stacks/meta - Get stacks metadata (lastRefreshAt + category counts)
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
    const store = getChatStore()
    const meta = await store.getStacksMeta(demoUid)

    return NextResponse.json(meta)
  } catch (error) {
    console.error("[GET /api/stacks/meta] Error:", error)
    return NextResponse.json(
      { error: "Failed to get stacks metadata" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/stacks/meta - Update lastRefreshAt timestamp
 *
 * Body: { timestamp?: number } (defaults to Date.now())
 */
export async function POST(request: NextRequest) {
  const demoUid = getDemoUid(request)

  if (!demoUid) {
    return NextResponse.json(
      { error: "No demo_uid cookie found" },
      { status: 401 }
    )
  }

  try {
    const body = (await request.json()) as { timestamp?: number }
    const timestamp = body.timestamp || Date.now()

    const store = getChatStore()
    await store.setLastStacksRefreshAt(demoUid, timestamp)

    // Return updated meta
    const meta = await store.getStacksMeta(demoUid)
    return NextResponse.json(meta)
  } catch (error) {
    console.error("[POST /api/stacks/meta] Error:", error)
    return NextResponse.json(
      { error: "Failed to update stacks metadata" },
      { status: 500 }
    )
  }
}
