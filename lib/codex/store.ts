/**
 * Codex Store - persistence for tasks and workspace snapshots
 *
 * Uses the same Redis + memory fallback pattern as the chat store.
 * Supports both Vercel KV and Upstash Redis env var patterns.
 */

import type { CodexTask, WorkspaceSnapshot } from "./types"
import { DEFAULT_WORKSPACE_FILES } from "./types"
import { getRedisClient, isRedisConfigured, getStorageMode } from "../store/redis-client"

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
 * Check if we're in development mode
 */
function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development"
}

/**
 * Log store operations (one line per request)
 */
function logOp(
  storeType: "Redis" | "Memory",
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
 * Redis-backed store
 * Works with both Vercel KV and Upstash Redis env var patterns
 */
class RedisCodexStore {
  async getTask(demoUid: string, taskId: string): Promise<CodexTask | null> {
    logOp("Redis", "getTask", demoUid, `taskId=${taskId.slice(0, 8)}`)
    const redis = getRedisClient()
    if (!redis) return null
    
    try {
      return await redis.get<CodexTask>(taskKey(demoUid, taskId))
    } catch (error) {
      console.error("[RedisCodexStore] getTask error:", error)
      return null
    }
  }

  async saveTask(demoUid: string, task: CodexTask): Promise<void> {
    logOp("Redis", "saveTask", demoUid, `taskId=${task.id.slice(0, 8)}`)
    const redis = getRedisClient()
    if (!redis) return
    
    try {
      // Set task with TTL
      await redis.set(taskKey(demoUid, task.id), task, { ex: KV_TTL_SECONDS })
      // Add to task list and refresh TTL
      await redis.sadd(taskListKey(demoUid), task.id)
      await redis.expire(taskListKey(demoUid), KV_TTL_SECONDS)
    } catch (error) {
      console.error("[RedisCodexStore] saveTask error:", error)
    }
  }

  async listTasks(demoUid: string): Promise<CodexTask[]> {
    logOp("Redis", "listTasks", demoUid)
    const redis = getRedisClient()
    if (!redis) return []
    
    try {
      const taskIds = await redis.smembers(taskListKey(demoUid))
      if (!taskIds || taskIds.length === 0) return []

      const tasks: CodexTask[] = []
      for (const id of taskIds) {
        const task = await redis.get<CodexTask>(taskKey(demoUid, id as string))
        if (task) tasks.push(task)
      }

      tasks.sort((a, b) => b.createdAt - a.createdAt)
      return tasks
    } catch (error) {
      console.error("[RedisCodexStore] listTasks error:", error)
      return []
    }
  }

  async getWorkspace(demoUid: string): Promise<WorkspaceSnapshot> {
    logOp("Redis", "getWorkspace", demoUid)
    const redis = getRedisClient()
    if (!redis) {
      return {
        files: { ...DEFAULT_WORKSPACE_FILES },
        updatedAt: Date.now(),
      }
    }
    
    try {
      const existing = await redis.get<WorkspaceSnapshot>(workspaceKey(demoUid))
      if (existing) return existing

      // Create default workspace with TTL
      const workspace: WorkspaceSnapshot = {
        files: { ...DEFAULT_WORKSPACE_FILES },
        updatedAt: Date.now(),
      }
      await redis.set(workspaceKey(demoUid), workspace, { ex: KV_TTL_SECONDS })
      return workspace
    } catch (error) {
      console.error("[RedisCodexStore] getWorkspace error:", error)
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
    logOp("Redis", "saveWorkspace", demoUid)
    const redis = getRedisClient()
    if (!redis) return
    
    try {
      await redis.set(workspaceKey(demoUid), workspace, { ex: KV_TTL_SECONDS })
    } catch (error) {
      console.error("[RedisCodexStore] saveWorkspace error:", error)
    }
  }
}

/**
 * Singleton store instances (persists across requests)
 */
let memoryStoreInstance: MemoryCodexStore | null = null
let redisStoreInstance: RedisCodexStore | null = null
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

function getRedisStore(): RedisCodexStore {
  if (!redisStoreInstance) {
    redisStoreInstance = new RedisCodexStore()
    if (!storeInitLogged) {
      console.log("[CodexStore] Initialized Redis store")
      storeInitLogged = true
    }
  }
  return redisStoreInstance
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
  if (isRedisConfigured()) {
    return getRedisStore()
  }
  if (isDevelopment()) {
    return getMemoryStore()
  }
  // This shouldn't happen if called through index.ts, but provide a fallback
  console.warn(
    "[CodexStore] WARNING: Using in-memory store in production. " +
      "Configure Redis env vars (KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN) for durable storage."
  )
  return getMemoryStore()
}

/**
 * Get the storage mode currently in use
 */
export { getStorageMode }
