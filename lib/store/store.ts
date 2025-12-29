/**
 * Chat store abstraction with Vercel KV backend + in-memory fallback
 *
 * This provides persistence for Demo 2/3 features without affecting Demo 1.
 * All operations are best-effort - failures should not break the app.
 */

import { kv } from "@vercel/kv"
import type {
  StoredChatThread,
  StoredChatThreadMeta,
  StoredChatMessage,
  StoredChatCategory,
  StacksMeta,
} from "./types"
import { STORED_CHAT_CATEGORIES } from "./types"

/**
 * Store interface for chat persistence
 */
export interface ChatStore {
  // Thread operations
  listThreads(demoUid: string): Promise<StoredChatThreadMeta[]>
  getThread(demoUid: string, threadId: string): Promise<StoredChatThread | null>
  createThread(
    demoUid: string,
    initial: Partial<StoredChatThread>
  ): Promise<StoredChatThread>
  appendMessage(
    demoUid: string,
    threadId: string,
    message: StoredChatMessage
  ): Promise<void>
  updateThread(
    demoUid: string,
    threadId: string,
    partial: Partial<StoredChatThread>
  ): Promise<void>
  deleteThread(demoUid: string, threadId: string): Promise<void>

  // Stacks meta operations
  getStacksMeta(demoUid: string): Promise<StacksMeta>
  setLastStacksRefreshAt(demoUid: string, ts: number): Promise<void>
}

/**
 * TTL for KV keys (7 days in seconds)
 */
const KV_TTL_SECONDS = 7 * 24 * 60 * 60 // 604800 seconds

/**
 * Key generation helpers for KV store
 * Namespace: u:{demo_uid}:chats:* for chat-related keys
 */
function threadListKey(demoUid: string): string {
  return `u:${demoUid}:chats:index`
}

function threadKey(demoUid: string, threadId: string): string {
  return `u:${demoUid}:chat:${threadId}`
}

function stacksMetaKey(demoUid: string): string {
  return `u:${demoUid}:stacks:meta`
}

/**
 * Generate a unique ID
 */
function generateId(): string {
  return crypto.randomUUID()
}

/**
 * Calculate category counts from threads
 */
function calculateCounts(
  threads: StoredChatThreadMeta[]
): Record<StoredChatCategory, number> {
  const counts = {} as Record<StoredChatCategory, number>
  for (const cat of STORED_CHAT_CATEGORIES) {
    counts[cat] = 0
  }
  for (const thread of threads) {
    counts[thread.category] = (counts[thread.category] || 0) + 1
  }
  return counts
}

/**
 * Check if Vercel KV is available (env vars set)
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
    ? `[ChatStore:${storeType}] ${operation} uid=${uid} ${extra}`
    : `[ChatStore:${storeType}] ${operation} uid=${uid}`
  console.log(msg)
}

/**
 * Vercel KV-backed store implementation
 */
class KVStore implements ChatStore {
  async listThreads(demoUid: string): Promise<StoredChatThreadMeta[]> {
    logOp("KV", "listThreads", demoUid)
    try {
      const threadIds = await kv.smembers(threadListKey(demoUid))
      if (!threadIds || threadIds.length === 0) return []

      const threads: StoredChatThreadMeta[] = []
      for (const id of threadIds) {
        const thread = await kv.get<StoredChatThread>(
          threadKey(demoUid, id as string)
        )
        if (thread) {
          // Return metadata without messages
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { messages: _, ...meta } = thread
          threads.push(meta)
        }
      }

      // Sort by updatedAt descending
      threads.sort((a, b) => b.updatedAt - a.updatedAt)
      return threads
    } catch (error) {
      console.error("[KVStore] listThreads error:", error)
      return []
    }
  }

  async getThread(
    demoUid: string,
    threadId: string
  ): Promise<StoredChatThread | null> {
    logOp("KV", "getThread", demoUid, `threadId=${threadId.slice(0, 8)}`)
    try {
      return await kv.get<StoredChatThread>(threadKey(demoUid, threadId))
    } catch (error) {
      console.error("[KVStore] getThread error:", error)
      return null
    }
  }

  async createThread(
    demoUid: string,
    initial: Partial<StoredChatThread>
  ): Promise<StoredChatThread> {
    const now = Date.now()
    const thread: StoredChatThread = {
      id: initial.id || generateId(),
      title: initial.title || "New Chat",
      category: initial.category || "recent",
      summary: initial.summary,
      createdAt: initial.createdAt || now,
      updatedAt: initial.updatedAt || now,
      lastResponseId: initial.lastResponseId ?? null,
      messages: initial.messages || [],
    }

    logOp("KV", "createThread", demoUid, `threadId=${thread.id.slice(0, 8)}`)
    try {
      // Set thread with TTL
      await kv.set(threadKey(demoUid, thread.id), thread, { ex: KV_TTL_SECONDS })
      // Set index with TTL (refresh on each write)
      await kv.sadd(threadListKey(demoUid), thread.id)
      await kv.expire(threadListKey(demoUid), KV_TTL_SECONDS)
    } catch (error) {
      console.error("[KVStore] createThread error:", error)
    }

    return thread
  }

  async appendMessage(
    demoUid: string,
    threadId: string,
    message: StoredChatMessage
  ): Promise<void> {
    logOp(
      "KV",
      "appendMessage",
      demoUid,
      `threadId=${threadId.slice(0, 8)} role=${message.role}`
    )
    try {
      const thread = await this.getThread(demoUid, threadId)
      if (!thread) {
        console.warn("[KVStore] appendMessage: thread not found", threadId)
        return
      }

      thread.messages.push(message)
      thread.updatedAt = Date.now()
      if (message.responseId) {
        thread.lastResponseId = message.responseId
      }

      // Update with TTL refresh
      await kv.set(threadKey(demoUid, threadId), thread, { ex: KV_TTL_SECONDS })
    } catch (error) {
      console.error("[KVStore] appendMessage error:", error)
    }
  }

  async updateThread(
    demoUid: string,
    threadId: string,
    partial: Partial<StoredChatThread>
  ): Promise<void> {
    logOp("KV", "updateThread", demoUid, `threadId=${threadId.slice(0, 8)}`)
    try {
      const thread = await this.getThread(demoUid, threadId)
      if (!thread) {
        console.warn("[KVStore] updateThread: thread not found", threadId)
        return
      }

      const updated = {
        ...thread,
        ...partial,
        updatedAt: Date.now(),
      }

      // Update with TTL refresh
      await kv.set(threadKey(demoUid, threadId), updated, { ex: KV_TTL_SECONDS })
    } catch (error) {
      console.error("[KVStore] updateThread error:", error)
    }
  }

  async deleteThread(demoUid: string, threadId: string): Promise<void> {
    logOp("KV", "deleteThread", demoUid, `threadId=${threadId.slice(0, 8)}`)
    try {
      await kv.del(threadKey(demoUid, threadId))
      await kv.srem(threadListKey(demoUid), threadId)
    } catch (error) {
      console.error("[KVStore] deleteThread error:", error)
    }
  }

  async getStacksMeta(demoUid: string): Promise<StacksMeta> {
    logOp("KV", "getStacksMeta", demoUid)
    try {
      const meta = await kv.get<{ lastRefreshAt: number | null }>(
        stacksMetaKey(demoUid)
      )
      const threads = await this.listThreads(demoUid)
      return {
        lastRefreshAt: meta?.lastRefreshAt ?? null,
        counts: calculateCounts(threads),
      }
    } catch (error) {
      console.error("[KVStore] getStacksMeta error:", error)
      return {
        lastRefreshAt: null,
        counts: calculateCounts([]),
      }
    }
  }

  async setLastStacksRefreshAt(demoUid: string, ts: number): Promise<void> {
    logOp("KV", "setLastStacksRefreshAt", demoUid)
    try {
      await kv.set(stacksMetaKey(demoUid), { lastRefreshAt: ts }, { ex: KV_TTL_SECONDS })
    } catch (error) {
      console.error("[KVStore] setLastStacksRefreshAt error:", error)
    }
  }
}

/**
 * In-memory store for local development without Vercel KV
 */
class MemoryStore implements ChatStore {
  private threads: Map<string, Map<string, StoredChatThread>> = new Map()
  private stacksMeta: Map<string, { lastRefreshAt: number | null }> = new Map()

  private getOrCreateUserThreads(
    demoUid: string
  ): Map<string, StoredChatThread> {
    if (!this.threads.has(demoUid)) {
      this.threads.set(demoUid, new Map())
    }
    return this.threads.get(demoUid)!
  }

  async listThreads(demoUid: string): Promise<StoredChatThreadMeta[]> {
    logOp("Memory", "listThreads", demoUid)
    const userThreads = this.getOrCreateUserThreads(demoUid)
    const threads = Array.from(userThreads.values()).map((t) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { messages: _, ...meta } = t
      return meta
    })
    threads.sort((a, b) => b.updatedAt - a.updatedAt)
    return threads
  }

  async getThread(
    demoUid: string,
    threadId: string
  ): Promise<StoredChatThread | null> {
    logOp("Memory", "getThread", demoUid, `threadId=${threadId.slice(0, 8)}`)
    const userThreads = this.getOrCreateUserThreads(demoUid)
    return userThreads.get(threadId) ?? null
  }

  async createThread(
    demoUid: string,
    initial: Partial<StoredChatThread>
  ): Promise<StoredChatThread> {
    const now = Date.now()
    const thread: StoredChatThread = {
      id: initial.id || generateId(),
      title: initial.title || "New Chat",
      category: initial.category || "recent",
      summary: initial.summary,
      createdAt: initial.createdAt || now,
      updatedAt: initial.updatedAt || now,
      lastResponseId: initial.lastResponseId ?? null,
      messages: initial.messages || [],
    }

    logOp("Memory", "createThread", demoUid, `threadId=${thread.id.slice(0, 8)}`)
    const userThreads = this.getOrCreateUserThreads(demoUid)
    userThreads.set(thread.id, thread)
    return thread
  }

  async appendMessage(
    demoUid: string,
    threadId: string,
    message: StoredChatMessage
  ): Promise<void> {
    logOp(
      "Memory",
      "appendMessage",
      demoUid,
      `threadId=${threadId.slice(0, 8)} role=${message.role}`
    )
    const userThreads = this.getOrCreateUserThreads(demoUid)
    const thread = userThreads.get(threadId)
    if (!thread) {
      console.warn("[MemoryStore] appendMessage: thread not found", threadId)
      return
    }

    thread.messages.push(message)
    thread.updatedAt = Date.now()
    if (message.responseId) {
      thread.lastResponseId = message.responseId
    }
  }

  async updateThread(
    demoUid: string,
    threadId: string,
    partial: Partial<StoredChatThread>
  ): Promise<void> {
    logOp("Memory", "updateThread", demoUid, `threadId=${threadId.slice(0, 8)}`)
    const userThreads = this.getOrCreateUserThreads(demoUid)
    const thread = userThreads.get(threadId)
    if (!thread) {
      console.warn("[MemoryStore] updateThread: thread not found", threadId)
      return
    }

    Object.assign(thread, partial, { updatedAt: Date.now() })
  }

  async deleteThread(demoUid: string, threadId: string): Promise<void> {
    logOp("Memory", "deleteThread", demoUid, `threadId=${threadId.slice(0, 8)}`)
    const userThreads = this.getOrCreateUserThreads(demoUid)
    userThreads.delete(threadId)
  }

  async getStacksMeta(demoUid: string): Promise<StacksMeta> {
    logOp("Memory", "getStacksMeta", demoUid)
    const meta = this.stacksMeta.get(demoUid)
    const threads = await this.listThreads(demoUid)
    return {
      lastRefreshAt: meta?.lastRefreshAt ?? null,
      counts: calculateCounts(threads),
    }
  }

  async setLastStacksRefreshAt(demoUid: string, ts: number): Promise<void> {
    logOp("Memory", "setLastStacksRefreshAt", demoUid)
    this.stacksMeta.set(demoUid, { lastRefreshAt: ts })
  }
}

/**
 * Singleton store instances (persists across requests)
 */
let memoryStoreInstance: MemoryStore | null = null
let kvStoreInstance: KVStore | null = null
let storeInitLogged = false

function getMemoryStore(): MemoryStore {
  if (!memoryStoreInstance) {
    memoryStoreInstance = new MemoryStore()
    if (!storeInitLogged) {
      console.log("[ChatStore] Initialized in-memory store (development only)")
      storeInitLogged = true
    }
  }
  return memoryStoreInstance
}

function getKVStore(): KVStore {
  if (!kvStoreInstance) {
    kvStoreInstance = new KVStore()
    if (!storeInitLogged) {
      console.log("[ChatStore] Initialized Vercel KV store")
      storeInitLogged = true
    }
  }
  return kvStoreInstance
}

/**
 * Get the appropriate store implementation based on environment
 *
 * Note: This function does NOT enforce the production check - that is done
 * by the index.ts wrapper. This allows the stores to be used directly in tests.
 */
export function getChatStore(): ChatStore {
  if (isKvAvailable()) {
    return getKVStore()
  }
  if (isDevelopment()) {
    return getMemoryStore()
  }
  // This shouldn't happen if called through index.ts, but provide a fallback
  console.warn(
    "[ChatStore] WARNING: Using in-memory store in production. " +
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

/**
 * Export a default store instance
 */
export const chatStore = {
  get store(): ChatStore {
    return getChatStore()
  },
}
