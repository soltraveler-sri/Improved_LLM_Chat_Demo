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
 * Errors propagate so ResilientCodexStore can detect and fall back.
 */
class RedisCodexStore {
  async getTask(demoUid: string, taskId: string): Promise<CodexTask | null> {
    logOp("Redis", "getTask", demoUid, `taskId=${taskId.slice(0, 8)}`)
    const redis = getRedisClient()
    if (!redis) return null
    return await redis.get<CodexTask>(taskKey(demoUid, taskId))
  }

  async saveTask(demoUid: string, task: CodexTask): Promise<void> {
    logOp("Redis", "saveTask", demoUid, `taskId=${task.id.slice(0, 8)}`)
    const redis = getRedisClient()
    if (!redis) return
    await redis.set(taskKey(demoUid, task.id), task, { ex: KV_TTL_SECONDS })
    await redis.sadd(taskListKey(demoUid), task.id)
    await redis.expire(taskListKey(demoUid), KV_TTL_SECONDS)
  }

  async listTasks(demoUid: string): Promise<CodexTask[]> {
    logOp("Redis", "listTasks", demoUid)
    const redis = getRedisClient()
    if (!redis) return []
    const taskIds = await redis.smembers(taskListKey(demoUid))
    if (!taskIds || taskIds.length === 0) return []

    const tasks: CodexTask[] = []
    for (const id of taskIds) {
      const task = await redis.get<CodexTask>(taskKey(demoUid, id as string))
      if (task) tasks.push(task)
    }
    tasks.sort((a, b) => b.createdAt - a.createdAt)
    return tasks
  }

  async getWorkspace(demoUid: string): Promise<WorkspaceSnapshot> {
    logOp("Redis", "getWorkspace", demoUid)
    const redis = getRedisClient()
    if (!redis) {
      return { files: { ...DEFAULT_WORKSPACE_FILES }, updatedAt: Date.now() }
    }
    const existing = await redis.get<WorkspaceSnapshot>(workspaceKey(demoUid))
    if (existing) return existing

    const workspace: WorkspaceSnapshot = {
      files: { ...DEFAULT_WORKSPACE_FILES },
      updatedAt: Date.now(),
    }
    await redis.set(workspaceKey(demoUid), workspace, { ex: KV_TTL_SECONDS })
    return workspace
  }

  async saveWorkspace(demoUid: string, workspace: WorkspaceSnapshot): Promise<void> {
    logOp("Redis", "saveWorkspace", demoUid)
    const redis = getRedisClient()
    if (!redis) return
    await redis.set(workspaceKey(demoUid), workspace, { ex: KV_TTL_SECONDS })
  }
}

/**
 * Resilient store that wraps RedisCodexStore with automatic MemoryCodexStore fallback.
 * Same pattern as ResilientRedisStore in the chat store.
 */
class ResilientCodexStore implements CodexStore {
  private redis: RedisCodexStore
  private fallback: MemoryCodexStore
  private redisHealthy = true
  private consecutiveFailures = 0
  private lastRetryAt = 0
  private fallbackWarningLogged = false

  private static readonly FAILURE_THRESHOLD = 1
  private static readonly RETRY_INTERVAL_MS = 30_000

  constructor(redis: RedisCodexStore, fallback: MemoryCodexStore) {
    this.redis = redis
    this.fallback = fallback
  }

  private markRedisFailure(): void {
    this.consecutiveFailures++
    if (this.consecutiveFailures >= ResilientCodexStore.FAILURE_THRESHOLD && this.redisHealthy) {
      this.redisHealthy = false
      if (!this.fallbackWarningLogged) {
        console.warn("[CodexStore:Resilient] Redis unreachable — falling back to in-memory store.")
        this.fallbackWarningLogged = true
      }
    }
  }

  private markRedisSuccess(): void {
    if (!this.redisHealthy) console.log("[CodexStore:Resilient] Redis connectivity restored")
    this.redisHealthy = true
    this.consecutiveFailures = 0
  }

  private shouldRetryRedis(): boolean {
    if (this.redisHealthy) return true
    const now = Date.now()
    if (now - this.lastRetryAt >= ResilientCodexStore.RETRY_INTERVAL_MS) {
      this.lastRetryAt = now
      return true
    }
    return false
  }

  private async tryRedisOrFallback<T>(
    operation: string,
    redisFn: () => Promise<T>,
    fallbackFn: () => Promise<T>,
  ): Promise<T> {
    if (!this.shouldRetryRedis()) return fallbackFn()
    try {
      const result = await redisFn()
      this.markRedisSuccess()
      return result
    } catch (error) {
      this.markRedisFailure()
      const errMsg = error instanceof Error ? error.message : String(error)
      const cause = error instanceof Error && error.cause
        ? ` (cause: ${error.cause instanceof Error ? error.cause.message : String(error.cause)})`
        : ""
      console.error(`[CodexStore:Resilient] ${operation} Redis failed, using fallback: ${errMsg}${cause}`)
      return fallbackFn()
    }
  }

  async getTask(demoUid: string, taskId: string): Promise<CodexTask | null> {
    return this.tryRedisOrFallback("getTask",
      () => this.redis.getTask(demoUid, taskId),
      () => this.fallback.getTask(demoUid, taskId))
  }

  async saveTask(demoUid: string, task: CodexTask): Promise<void> {
    await this.tryRedisOrFallback("saveTask",
      async () => { await this.redis.saveTask(demoUid, task); await this.fallback.saveTask(demoUid, task) },
      () => this.fallback.saveTask(demoUid, task))
  }

  async listTasks(demoUid: string): Promise<CodexTask[]> {
    return this.tryRedisOrFallback("listTasks",
      () => this.redis.listTasks(demoUid),
      () => this.fallback.listTasks(demoUid))
  }

  async getWorkspace(demoUid: string): Promise<WorkspaceSnapshot> {
    return this.tryRedisOrFallback("getWorkspace",
      () => this.redis.getWorkspace(demoUid),
      () => this.fallback.getWorkspace(demoUid))
  }

  async saveWorkspace(demoUid: string, workspace: WorkspaceSnapshot): Promise<void> {
    await this.tryRedisOrFallback("saveWorkspace",
      async () => { await this.redis.saveWorkspace(demoUid, workspace); await this.fallback.saveWorkspace(demoUid, workspace) },
      () => this.fallback.saveWorkspace(demoUid, workspace))
  }
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
 * Singleton store instances (persists across requests)
 */
let memoryStoreInstance: MemoryCodexStore | null = null
let redisStoreInstance: RedisCodexStore | null = null
let resilientStoreInstance: ResilientCodexStore | null = null
let storeInitLogged = false

function getMemoryStore(): MemoryCodexStore {
  if (!memoryStoreInstance) {
    memoryStoreInstance = new MemoryCodexStore()
  }
  return memoryStoreInstance
}

function getRedisStore(): RedisCodexStore {
  if (!redisStoreInstance) {
    redisStoreInstance = new RedisCodexStore()
  }
  return redisStoreInstance
}

function getResilientStore(): ResilientCodexStore {
  if (!resilientStoreInstance) {
    resilientStoreInstance = new ResilientCodexStore(getRedisStore(), getMemoryStore())
    if (!storeInitLogged) {
      console.log("[CodexStore] Initialized resilient Redis store (with memory fallback)")
      storeInitLogged = true
    }
  }
  return resilientStoreInstance
}

/**
 * Get the appropriate store implementation
 *
 * When Redis is configured, returns a ResilientCodexStore that automatically
 * falls back to MemoryCodexStore if Redis becomes unreachable.
 */
export function getCodexStore(): CodexStore {
  if (isRedisConfigured()) {
    return getResilientStore()
  }
  if (isDevelopment()) {
    if (!storeInitLogged) {
      console.log("[CodexStore] Initialized in-memory store (development only)")
      storeInitLogged = true
    }
    return getMemoryStore()
  }
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
