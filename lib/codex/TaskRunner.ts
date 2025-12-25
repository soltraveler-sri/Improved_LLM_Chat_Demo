/**
 * TaskRunner Interface
 *
 * Defines the contract for task runners that process @codex prompts.
 * This allows swapping between MockTaskRunner (demo) and CodexCloudTaskRunner (production).
 */

import type { CodexTask, WorkspaceSnapshot } from "./types"

/**
 * Arguments for starting a new task
 */
export interface StartTaskArgs {
  /** The user's prompt (without @codex prefix) */
  prompt: string
  /** Current workspace state */
  workspace: WorkspaceSnapshot
  /** Demo user ID for storage */
  demoUid: string
}

/**
 * TaskRunner interface - implemented by MockTaskRunner and CodexCloudTaskRunner
 */
export interface TaskRunner {
  /**
   * Start a new task based on the user prompt
   *
   * @param args - Task arguments including prompt and workspace
   * @returns The created task (initially with status "running")
   */
  startTask(args: StartTaskArgs): Promise<CodexTask>

  /**
   * Apply the task's generated changes to the workspace
   *
   * @param taskId - The task ID
   * @param demoUid - Demo user ID
   * @returns Updated workspace snapshot
   */
  applyChanges(taskId: string, demoUid: string): Promise<WorkspaceSnapshot>

  /**
   * Create a PR from the task's changes (demo: generates fake URL)
   *
   * @param taskId - The task ID
   * @param demoUid - Demo user ID
   * @returns Object with PR URL
   */
  createPR(taskId: string, demoUid: string): Promise<{ prUrl: string }>

  /**
   * Get a task by ID
   *
   * @param taskId - The task ID
   * @param demoUid - Demo user ID
   * @returns The task or null if not found
   */
  getTask(taskId: string, demoUid: string): Promise<CodexTask | null>
}
