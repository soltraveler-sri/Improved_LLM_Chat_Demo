/**
 * Codex Store - persistence for tasks and workspace snapshots
 *
 * Uses the same KV + memory fallback pattern as the chat store.
 */

import { kv } from "@vercel/kv"
import type { CodexTask, WorkspaceSnapshot } from "./types"
import { DEFAULT_WORKSPACE_FILES } from "./types"

/**
 * TTL for KV keys (7 days in seconds)
 */
const KV_TTL_SECONDS = 7 * 24 * 60 * 60 // 604800 seconds

/**
 * Key generation helpers
 * Namespace: u:{demo_uid}:codex:* for codex-related keys
 */
function taskKey(demoUid: string, taskId: string): string {
  return `u:${demoUid}:codex:task:${taskId}`
}

function taskListKey(demoUid: string): string {
  return `u:${demoUid}:codex:tasks`
}

function workspaceKey(demoUid: string): string {
  return `u:${demoUid}:codex:workspace`
}

/**
 * Check if Vercel KV is available
 */
function isKvAvailable(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

/**
 * Check if we're in development mode
 */
function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development"
}

/**
 * Log store operations (one line per request)
 */
function logOp(
  storeType: "KV" | "Memory",
  operation: string,
  demoUid: string,
  extra?: string
): void {
  const uid = demoUid.slice(0, 8)
  const msg = extra
    ? `[CodexStore:${storeType}] ${operation} uid=${uid} ${extra}`
    : `[CodexStore:${storeType}] ${operation} uid=${uid}`
  console.log(msg)
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
    logOp("Memory", "getTask", demoUid, `taskId=${taskId.slice(0, 8)}`)
    const userTasks = this.getOrCreateUserTasks(demoUid)
    return userTasks.get(taskId) ?? null
  }

  async saveTask(demoUid: string, task: CodexTask): Promise<void> {
    logOp("Memory", "saveTask", demoUid, `taskId=${task.id.slice(0, 8)}`)
    const userTasks = this.getOrCreateUserTasks(demoUid)
    userTasks.set(task.id, task)
  }

  async listTasks(demoUid: string): Promise<CodexTask[]> {
    logOp("Memory", "listTasks", demoUid)
    const userTasks = this.getOrCreateUserTasks(demoUid)
    const tasks = Array.from(userTasks.values())
    tasks.sort((a, b) => b.createdAt - a.createdAt)
    return tasks
  }

  async getWorkspace(demoUid: string): Promise<WorkspaceSnapshot> {
    logOp("Memory", "getWorkspace", demoUid)
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
    logOp("Memory", "saveWorkspace", demoUid)
    this.workspaces.set(demoUid, workspace)
  }
}

/**
 * KV-backed store
 */
class KVCodexStore {
  async getTask(demoUid: string, taskId: string): Promise<CodexTask | null> {
    logOp("KV", "getTask", demoUid, `taskId=${taskId.slice(0, 8)}`)
    try {
      return await kv.get<CodexTask>(taskKey(demoUid, taskId))
    } catch (error) {
      console.error("[KVCodexStore] getTask error:", error)
      return null
    }
  }

  async saveTask(demoUid: string, task: CodexTask): Promise<void> {
    logOp("KV", "saveTask", demoUid, `taskId=${task.id.slice(0, 8)}`)
    try {
      // Set task with TTL
      await kv.set(taskKey(demoUid, task.id), task, { ex: KV_TTL_SECONDS })
      // Add to task list and refresh TTL
      await kv.sadd(taskListKey(demoUid), task.id)
      await kv.expire(taskListKey(demoUid), KV_TTL_SECONDS)
    } catch (error) {
      console.error("[KVCodexStore] saveTask error:", error)
    }
  }

  async listTasks(demoUid: string): Promise<CodexTask[]> {
    logOp("KV", "listTasks", demoUid)
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
    logOp("KV", "getWorkspace", demoUid)
    try {
      const existing = await kv.get<WorkspaceSnapshot>(workspaceKey(demoUid))
      if (existing) return existing

      // Create default workspace with TTL
      const workspace: WorkspaceSnapshot = {
        files: { ...DEFAULT_WORKSPACE_FILES },
        updatedAt: Date.now(),
      }
      await kv.set(workspaceKey(demoUid), workspace, { ex: KV_TTL_SECONDS })
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
    logOp("KV", "saveWorkspace", demoUid)
    try {
      await kv.set(workspaceKey(demoUid), workspace, { ex: KV_TTL_SECONDS })
    } catch (error) {
      console.error("[KVCodexStore] saveWorkspace error:", error)
    }
  }
}

/**
 * Singleton store instances (persists across requests)
 */
let memoryStoreInstance: MemoryCodexStore | null = null
let kvStoreInstance: KVCodexStore | null = null
let storeInitLogged = false

function getMemoryStore(): MemoryCodexStore {
  if (!memoryStoreInstance) {
    memoryStoreInstance = new MemoryCodexStore()
    if (!storeInitLogged) {
      console.log("[CodexStore] Initialized in-memory store (development only)")
      storeInitLogged = true
    }
  }
  return memoryStoreInstance
}

function getKVStore(): KVCodexStore {
  if (!kvStoreInstance) {
    kvStoreInstance = new KVCodexStore()
    if (!storeInitLogged) {
      console.log("[CodexStore] Initialized Vercel KV store")
      storeInitLogged = true
    }
  }
  return kvStoreInstance
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
 *
 * Note: This function does NOT enforce the production check - that is done
 * by the index.ts wrapper. This allows the stores to be used directly in tests.
 */
export function getCodexStore(): CodexStore {
  if (isKvAvailable()) {
    return getKVStore()
  }
  if (isDevelopment()) {
    return getMemoryStore()
  }
  // This shouldn't happen if called through index.ts, but provide a fallback
  console.warn(
    "[CodexStore] WARNING: Using in-memory store in production. " +
      "Configure KV_REST_API_URL + KV_REST_API_TOKEN for durable storage."
  )
  return getMemoryStore()
}

/**
 * Get the storage type currently in use
 */
export function getStorageType(): "kv" | "memory" {
  return isKvAvailable() ? "kv" : "memory"
}
