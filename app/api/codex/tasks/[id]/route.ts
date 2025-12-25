import { NextRequest, NextResponse } from "next/server"
import { getMockTaskRunner } from "@/lib/codex"

/**
 * Helper to get demo_uid from cookies
 */
function getDemoUid(request: NextRequest): string | null {
  return request.cookies.get("demo_uid")?.value ?? null
}

/**
 * GET /api/codex/tasks/[id] - Get a single task with full details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const demoUid = getDemoUid(request)

  if (!demoUid) {
    return NextResponse.json(
      { error: "No demo_uid cookie found" },
      { status: 401 }
    )
  }

  try {
    const { id } = await params
    const runner = getMockTaskRunner()
    const task = await runner.getTask(id, demoUid)

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    return NextResponse.json({ task })
  } catch (error) {
    console.error("[GET /api/codex/tasks/[id]] Error:", error)
    return NextResponse.json(
      { error: "Failed to get task" },
      { status: 500 }
    )
  }
}
