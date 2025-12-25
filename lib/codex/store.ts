/**
 * Codex Store - persistence for tasks and workspace snapshots
 *
 * Uses the same KV + memory fallback pattern as the chat store.
 */

import { kv } from "@vercel/kv"
import type { CodexTask, WorkspaceSnapshot } from "./types"
import { DEFAULT_WORKSPACE_FILES } from "./types"

/**
 * Key generation helpers
 */
function taskKey(demoUid: string, taskId: string): string {
  return `codex:${demoUid}:task:${taskId}`
}

function taskListKey(demoUid: string): string {
  return `codex:${demoUid}:tasks`
}

function workspaceKey(demoUid: string): string {
  return `codex:${demoUid}:workspace`
}

/**
 * Check if Vercel KV is available
 */
function isKvAvailable(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

/**
 * In-memory store for local development
 */
class MemoryCodexStore {
  private tasks: Map<string, Map<string, CodexTask>> = new Map()
  private workspaces: Map<string, WorkspaceSnapshot> = new Map()

  private getOrCreateUserTasks(demoUid: string): Map<string, CodexTask> {
    if (!this.tasks.has(demoUid)) {
      this.tasks.set(demoUid, new Map())
    }
    return this.tasks.get(demoUid)!
  }

  async getTask(demoUid: string, taskId: string): Promise<CodexTask | null> {
    const userTasks = this.getOrCreateUserTasks(demoUid)
    return userTasks.get(taskId) ?? null
  }

  async saveTask(demoUid: string, task: CodexTask): Promise<void> {
    const userTasks = this.getOrCreateUserTasks(demoUid)
    userTasks.set(task.id, task)
  }

  async listTasks(demoUid: string): Promise<CodexTask[]> {
    const userTasks = this.getOrCreateUserTasks(demoUid)
    const tasks = Array.from(userTasks.values())
    tasks.sort((a, b) => b.createdAt - a.createdAt)
    return tasks
  }

  async getWorkspace(demoUid: string): Promise<WorkspaceSnapshot> {
    const existing = this.workspaces.get(demoUid)
    if (existing) return existing

    // Create default workspace
    const workspace: WorkspaceSnapshot = {
      files: { ...DEFAULT_WORKSPACE_FILES },
      updatedAt: Date.now(),
    }
    this.workspaces.set(demoUid, workspace)
    return workspace
  }

  async saveWorkspace(
    demoUid: string,
    workspace: WorkspaceSnapshot
  ): Promise<void> {
    this.workspaces.set(demoUid, workspace)
  }
}

/**
 * KV-backed store
 */
class KVCodexStore {
  async getTask(demoUid: string, taskId: string): Promise<CodexTask | null> {
    try {
      return await kv.get<CodexTask>(taskKey(demoUid, taskId))
    } catch (error) {
      console.error("[KVCodexStore] getTask error:", error)
      return null
    }
  }

  async saveTask(demoUid: string, task: CodexTask): Promise<void> {
    try {
      await kv.set(taskKey(demoUid, task.id), task)
      await kv.sadd(taskListKey(demoUid), task.id)
    } catch (error) {
      console.error("[KVCodexStore] saveTask error:", error)
    }
  }

  async listTasks(demoUid: string): Promise<CodexTask[]> {
    try {
      const taskIds = await kv.smembers(taskListKey(demoUid))
      if (!taskIds || taskIds.length === 0) return []

      const tasks: CodexTask[] = []
      for (const id of taskIds) {
        const task = await kv.get<CodexTask>(taskKey(demoUid, id as string))
        if (task) tasks.push(task)
      }

      tasks.sort((a, b) => b.createdAt - a.createdAt)
      return tasks
    } catch (error) {
      console.error("[KVCodexStore] listTasks error:", error)
      return []
    }
  }

  async getWorkspace(demoUid: string): Promise<WorkspaceSnapshot> {
    try {
      const existing = await kv.get<WorkspaceSnapshot>(workspaceKey(demoUid))
      if (existing) return existing

      // Create default workspace
      const workspace: WorkspaceSnapshot = {
        files: { ...DEFAULT_WORKSPACE_FILES },
        updatedAt: Date.now(),
      }
      await kv.set(workspaceKey(demoUid), workspace)
      return workspace
    } catch (error) {
      console.error("[KVCodexStore] getWorkspace error:", error)
      return {
        files: { ...DEFAULT_WORKSPACE_FILES },
        updatedAt: Date.now(),
      }
    }
  }

  async saveWorkspace(
    demoUid: string,
    workspace: WorkspaceSnapshot
  ): Promise<void> {
    try {
      await kv.set(workspaceKey(demoUid), workspace)
    } catch (error) {
      console.error("[KVCodexStore] saveWorkspace error:", error)
    }
  }
}

/**
 * Singleton memory store instance
 */
let memoryStoreInstance: MemoryCodexStore | null = null

function getMemoryStore(): MemoryCodexStore {
  if (!memoryStoreInstance) {
    memoryStoreInstance = new MemoryCodexStore()
    console.log("[CodexStore] Using in-memory store")
  }
  return memoryStoreInstance
}

/**
 * Codex store interface
 */
export interface CodexStore {
  getTask(demoUid: string, taskId: string): Promise<CodexTask | null>
  saveTask(demoUid: string, task: CodexTask): Promise<void>
  listTasks(demoUid: string): Promise<CodexTask[]>
  getWorkspace(demoUid: string): Promise<WorkspaceSnapshot>
  saveWorkspace(demoUid: string, workspace: WorkspaceSnapshot): Promise<void>
}

/**
 * Get the appropriate store implementation
 */
export function getCodexStore(): CodexStore {
  if (isKvAvailable()) {
    return new KVCodexStore()
  }
  return getMemoryStore()
}
