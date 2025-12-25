import { NextRequest, NextResponse } from "next/server"
import { getMockTaskRunner } from "@/lib/codex"

/**
 * Helper to get demo_uid from cookies
 */
function getDemoUid(request: NextRequest): string | null {
  return request.cookies.get("demo_uid")?.value ?? null
}

/**
 * POST /api/codex/tasks/[id]/pr - Create a PR from task changes
 */
export async function POST(
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

    const result = await runner.createPR(id, demoUid)

    // Get updated task
    const task = await runner.getTask(id, demoUid)

    return NextResponse.json({ task, prUrl: result.prUrl })
  } catch (error) {
    console.error("[POST /api/codex/tasks/[id]/pr] Error:", error)

    const errorMessage =
      error instanceof Error ? error.message : "Failed to create PR"

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
