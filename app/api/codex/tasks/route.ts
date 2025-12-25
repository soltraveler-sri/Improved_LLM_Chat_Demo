import { NextRequest, NextResponse } from "next/server"
import { getMockTaskRunner, getCodexStore } from "@/lib/codex"

/**
 * Helper to get demo_uid from cookies
 */
function getDemoUid(request: NextRequest): string | null {
  return request.cookies.get("demo_uid")?.value ?? null
}

/**
 * GET /api/codex/tasks - List all tasks for the current user
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
    const tasks = await store.listTasks(demoUid)

    // Return metadata only (without full changes for list view)
    const taskMetas = tasks.map((t) => ({
      id: t.id,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      prompt: t.prompt,
      title: t.title,
      status: t.status,
      prUrl: t.prUrl,
      error: t.error,
    }))

    return NextResponse.json({ tasks: taskMetas })
  } catch (error) {
    console.error("[GET /api/codex/tasks] Error:", error)
    return NextResponse.json(
      { error: "Failed to list tasks" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/codex/tasks - Create and start a new task
 *
 * Body: { prompt: string }
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
    const body = (await request.json()) as { prompt?: string }

    if (!body.prompt || typeof body.prompt !== "string") {
      return NextResponse.json(
        { error: "Missing required field: prompt" },
        { status: 400 }
      )
    }

    // Get current workspace
    const store = getCodexStore()
    const workspace = await store.getWorkspace(demoUid)

    // Start the task
    const runner = getMockTaskRunner()
    const task = await runner.startTask({
      prompt: body.prompt,
      workspace,
      demoUid,
    })

    return NextResponse.json({ task }, { status: 201 })
  } catch (error) {
    console.error("[POST /api/codex/tasks] Error:", error)

    const errorMessage =
      error instanceof Error ? error.message : "Failed to create task"

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
