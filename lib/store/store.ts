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
 * Key generation helpers for KV store
 */
function threadListKey(demoUid: string): string {
  return `chat:${demoUid}:threads`
}

function threadKey(demoUid: string, threadId: string): string {
  return `chat:${demoUid}:thread:${threadId}`
}

function stacksMetaKey(demoUid: string): string {
  return `chat:${demoUid}:stacks_meta`
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
 * Vercel KV-backed store implementation
 */
class KVStore implements ChatStore {
  async listThreads(demoUid: string): Promise<StoredChatThreadMeta[]> {
    try {
      const threadIds = await kv.smembers(threadListKey(demoUid))
      if (!threadIds || threadIds.length === 0) return []

      const threads: StoredChatThreadMeta[] = []
      for (const id of threadIds) {
        const thread = await kv.get<StoredChatThread>(threadKey(demoUid, id as string))
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

    try {
      await kv.set(threadKey(demoUid, thread.id), thread)
      await kv.sadd(threadListKey(demoUid), thread.id)
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

      await kv.set(threadKey(demoUid, threadId), thread)
    } catch (error) {
      console.error("[KVStore] appendMessage error:", error)
    }
  }

  async updateThread(
    demoUid: string,
    threadId: string,
    partial: Partial<StoredChatThread>
  ): Promise<void> {
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

      await kv.set(threadKey(demoUid, threadId), updated)
    } catch (error) {
      console.error("[KVStore] updateThread error:", error)
    }
  }

  async deleteThread(demoUid: string, threadId: string): Promise<void> {
    try {
      await kv.del(threadKey(demoUid, threadId))
      await kv.srem(threadListKey(demoUid), threadId)
    } catch (error) {
      console.error("[KVStore] deleteThread error:", error)
    }
  }

  async getStacksMeta(demoUid: string): Promise<StacksMeta> {
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
    try {
      await kv.set(stacksMetaKey(demoUid), { lastRefreshAt: ts })
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

    const userThreads = this.getOrCreateUserThreads(demoUid)
    userThreads.set(thread.id, thread)
    return thread
  }

  async appendMessage(
    demoUid: string,
    threadId: string,
    message: StoredChatMessage
  ): Promise<void> {
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
    const userThreads = this.getOrCreateUserThreads(demoUid)
    const thread = userThreads.get(threadId)
    if (!thread) {
      console.warn("[MemoryStore] updateThread: thread not found", threadId)
      return
    }

    Object.assign(thread, partial, { updatedAt: Date.now() })
  }

  async deleteThread(demoUid: string, threadId: string): Promise<void> {
    const userThreads = this.getOrCreateUserThreads(demoUid)
    userThreads.delete(threadId)
  }

  async getStacksMeta(demoUid: string): Promise<StacksMeta> {
    const meta = this.stacksMeta.get(demoUid)
    const threads = await this.listThreads(demoUid)
    return {
      lastRefreshAt: meta?.lastRefreshAt ?? null,
      counts: calculateCounts(threads),
    }
  }

  async setLastStacksRefreshAt(demoUid: string, ts: number): Promise<void> {
    this.stacksMeta.set(demoUid, { lastRefreshAt: ts })
  }
}

/**
 * Singleton memory store instance (persists across requests in dev)
 */
let memoryStoreInstance: MemoryStore | null = null

function getMemoryStore(): MemoryStore {
  if (!memoryStoreInstance) {
    memoryStoreInstance = new MemoryStore()
    console.log("[ChatStore] Using in-memory store (KV env not configured)")
  }
  return memoryStoreInstance
}

/**
 * Get the appropriate store implementation based on environment
 */
export function getChatStore(): ChatStore {
  if (isKvAvailable()) {
    console.log("[ChatStore] Using Vercel KV store")
    return new KVStore()
  }
  return getMemoryStore()
}

/**
 * Export a default store instance
 */
export const chatStore = {
  get store(): ChatStore {
    return getChatStore()
  },
}
