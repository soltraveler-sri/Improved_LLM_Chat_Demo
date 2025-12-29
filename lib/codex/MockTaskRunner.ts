/**
 * MockTaskRunner - Demo implementation of TaskRunner
 *
 * Uses OpenAI to generate realistic task outputs including:
 * - A title for the task
 * - A plan in markdown format
 * - File changes
 * - Log messages
 */

import OpenAI from "openai"
import { z } from "zod"
import { zodTextFormat } from "openai/helpers/zod"
import type { TaskRunner, StartTaskArgs } from "./TaskRunner"
import type { CodexTask, WorkspaceSnapshot, CodexFileChange } from "./types"
import { getCodexStore } from "@/lib/store"

/**
 * Zod schema for structured output from the model
 */
const FileChangeSchema = z.object({
  path: z.string().describe("File path relative to project root"),
  after: z.string().describe("Complete new file contents"),
})

const TaskOutputSchema = z.object({
  title: z
    .string()
    .describe("A short title for this task (max 60 chars)"),
  planMarkdown: z
    .string()
    .describe(
      "A step-by-step plan in markdown format explaining what changes will be made"
    ),
  changes: z
    .array(FileChangeSchema)
    .describe("Array of file changes to apply"),
  logs: z
    .array(z.string())
    .describe("Log messages showing progress"),
})

type TaskOutput = z.infer<typeof TaskOutputSchema>

/**
 * Generate a unique task ID
 */
function generateTaskId(): string {
  return `task_${crypto.randomUUID().slice(0, 8)}`
}

/**
 * Build the prompt for task generation
 */
function buildTaskPrompt(
  userPrompt: string,
  workspace: WorkspaceSnapshot
): string {
  const fileList = Object.entries(workspace.files)
    .map(([path, content]) => {
      // Truncate large files
      const truncated =
        content.length > 500 ? content.slice(0, 500) + "\n... (truncated)" : content
      return `### ${path}\n\`\`\`\n${truncated}\n\`\`\``
    })
    .join("\n\n")

  return `You are a coding assistant that generates file changes based on user requests.

## Current Workspace Files

${fileList}

## User Request

${userPrompt}

## Instructions

1. Generate a short, descriptive title for this task
2. Create a step-by-step plan in markdown explaining what you'll do
3. Generate the file changes needed (provide complete new file contents for each changed file)
4. Create log messages that would appear during execution

Be concise but thorough. Only modify files that need changes.
Return a JSON object with: title, planMarkdown, changes, logs`
}

/**
 * Generate a unified diff from changes
 */
function generateUnifiedDiff(
  changes: CodexFileChange[],
  workspace: WorkspaceSnapshot
): string {
  const diffs: string[] = []

  for (const change of changes) {
    const before = workspace.files[change.path] || ""
    const after = change.after

    // Simple diff header
    diffs.push(`--- a/${change.path}`)
    diffs.push(`+++ b/${change.path}`)

    // Show a simplified diff (in production, use a real diff library)
    const beforeLines = before.split("\n")
    const afterLines = after.split("\n")

    if (before === "") {
      // New file
      diffs.push(`@@ -0,0 +1,${afterLines.length} @@`)
      afterLines.forEach((line) => diffs.push(`+${line}`))
    } else {
      // Modified file - just show first few changes for demo
      diffs.push(`@@ -1,${beforeLines.length} +1,${afterLines.length} @@`)
      // Show first 10 lines of each for brevity
      beforeLines.slice(0, 10).forEach((line) => diffs.push(`-${line}`))
      afterLines.slice(0, 10).forEach((line) => diffs.push(`+${line}`))
      if (afterLines.length > 10) {
        diffs.push(`... (${afterLines.length - 10} more lines)`)
      }
    }

    diffs.push("")
  }

  return diffs.join("\n")
}

/**
 * MockTaskRunner implementation
 */
export class MockTaskRunner implements TaskRunner {
  async startTask(args: StartTaskArgs): Promise<CodexTask> {
    const { prompt, workspace, demoUid } = args
    const store = getCodexStore()

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured")
    }

    // Create initial task
    const taskId = generateTaskId()
    const now = Date.now()

    const task: CodexTask = {
      id: taskId,
      createdAt: now,
      updatedAt: now,
      prompt,
      title: "Processing...",
      status: "running",
      planMarkdown: "",
      changes: [],
      logs: ["Task started", "Analyzing workspace..."],
      diffUnified: "",
    }

    // Save initial task
    await store.saveTask(demoUid, task)

    try {
      // Build prompt and call OpenAI
      const fullPrompt = buildTaskPrompt(prompt, workspace)
      const openai = new OpenAI({ apiKey })
      const model = process.env.OPENAI_CODEX_MODEL || "gpt-4o-mini"

      console.log(`[MockTaskRunner] Starting task ${taskId} with model ${model}`)

      const response = await openai.responses.parse({
        model,
        input: fullPrompt,
        store: false,
        reasoning: { effort: "none" },
        text: {
          format: zodTextFormat(TaskOutputSchema, "task_output"),
        },
      })

      const parsed = response.output_parsed as TaskOutput | null

      if (!parsed) {
        throw new Error("Failed to parse task output")
      }

      // Populate changes with before content
      const changesWithBefore: CodexFileChange[] = parsed.changes.map(
        (change) => ({
          path: change.path,
          before: workspace.files[change.path],
          after: change.after,
        })
      )

      // Generate unified diff
      const diffUnified = generateUnifiedDiff(changesWithBefore, workspace)

      // Update task with results
      const updatedTask: CodexTask = {
        ...task,
        updatedAt: Date.now(),
        title: parsed.title,
        status: "draft_ready",
        planMarkdown: parsed.planMarkdown,
        changes: changesWithBefore,
        diffUnified,
        logs: [
          ...task.logs,
          "Generating plan...",
          ...parsed.logs,
          "Changes ready for review",
        ],
      }

      await store.saveTask(demoUid, updatedTask)
      console.log(`[MockTaskRunner] Task ${taskId} completed with ${changesWithBefore.length} changes`)

      return updatedTask
    } catch (error) {
      console.error(`[MockTaskRunner] Task ${taskId} failed:`, error)

      // Update task with error
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error"
      const failedTask: CodexTask = {
        ...task,
        updatedAt: Date.now(),
        status: "failed",
        error: errorMessage,
        logs: [...task.logs, `Error: ${errorMessage}`],
      }

      await store.saveTask(demoUid, failedTask)
      return failedTask
    }
  }

  async applyChanges(taskId: string, demoUid: string): Promise<WorkspaceSnapshot> {
    const store = getCodexStore()

    const task = await store.getTask(demoUid, taskId)
    if (!task) {
      throw new Error(`Task not found: ${taskId}`)
    }

    if (task.status !== "draft_ready" && task.status !== "applied") {
      throw new Error(`Cannot apply changes: task status is ${task.status}`)
    }

    // Get current workspace
    const workspace = await store.getWorkspace(demoUid)

    // Apply changes
    const updatedFiles = { ...workspace.files }
    for (const change of task.changes) {
      updatedFiles[change.path] = change.after
    }

    const updatedWorkspace: WorkspaceSnapshot = {
      files: updatedFiles,
      updatedAt: Date.now(),
    }

    // Save updated workspace
    await store.saveWorkspace(demoUid, updatedWorkspace)

    // Update task status
    const updatedTask: CodexTask = {
      ...task,
      updatedAt: Date.now(),
      status: "applied",
      logs: [...task.logs, "Changes applied to workspace"],
    }
    await store.saveTask(demoUid, updatedTask)

    console.log(`[MockTaskRunner] Applied ${task.changes.length} changes for task ${taskId}`)

    return updatedWorkspace
  }

  async createPR(taskId: string, demoUid: string): Promise<{ prUrl: string }> {
    const store = getCodexStore()

    const task = await store.getTask(demoUid, taskId)
    if (!task) {
      throw new Error(`Task not found: ${taskId}`)
    }

    if (task.status !== "applied" && task.status !== "draft_ready") {
      throw new Error(`Cannot create PR: task status is ${task.status}`)
    }

    // Generate fake PR URL
    const prNumber = Math.floor(Math.random() * 900) + 100
    const prUrl = `https://github.com/demo-org/demo-repo/pull/${prNumber}`

    // Update task
    const updatedTask: CodexTask = {
      ...task,
      updatedAt: Date.now(),
      status: "pr_created",
      prUrl,
      logs: [...task.logs, `PR created: ${prUrl}`],
    }
    await store.saveTask(demoUid, updatedTask)

    console.log(`[MockTaskRunner] Created PR for task ${taskId}: ${prUrl}`)

    return { prUrl }
  }

  async getTask(taskId: string, demoUid: string): Promise<CodexTask | null> {
    const store = getCodexStore()
    return store.getTask(demoUid, taskId)
  }
}

/**
 * Singleton instance
 */
let mockRunnerInstance: MockTaskRunner | null = null

export function getMockTaskRunner(): MockTaskRunner {
  if (!mockRunnerInstance) {
    mockRunnerInstance = new MockTaskRunner()
  }
  return mockRunnerInstance
}
