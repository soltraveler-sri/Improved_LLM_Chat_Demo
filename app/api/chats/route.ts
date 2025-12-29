import { NextRequest, NextResponse } from "next/server"
import { getChatStore } from "@/lib/store"
import type { StoredChatThread } from "@/lib/store"

/**
 * Helper to get demo_uid from cookies
 */
function getDemoUid(request: NextRequest): string | null {
  return request.cookies.get("demo_uid")?.value ?? null
}

/**
 * GET /api/chats - List all threads for the current user (metadata only)
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
    const threads = await store.listThreads(demoUid)

    return NextResponse.json({ threads })
  } catch (error) {
    console.error("[GET /api/chats] Error:", error)
    return NextResponse.json(
      { error: "Failed to list threads" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/chats - Create a new thread
 *
 * Body: Partial<StoredChatThread> (optional fields: title, category, etc.)
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
    const body = (await request.json()) as Partial<StoredChatThread>

    const store = getChatStore()
    const thread = await store.createThread(demoUid, {
      title: body.title || "New Chat",
      category: body.category || "recent",
      summary: body.summary,
      lastResponseId: body.lastResponseId,
      messages: body.messages || [],
    })

    return NextResponse.json({ thread }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/chats] Error:", error)
    return NextResponse.json(
      { error: "Failed to create thread" },
      { status: 500 }
    )
  }
}
