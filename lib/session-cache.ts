/**
 * SessionChatCache — Client-side sessionStorage write-through cache
 *
 * Provides session-scoped persistence for chat threads and codex tasks.
 * Acts as a reliable fallback when the server-side store (Redis) is unreachable
 * in a serverless environment where in-memory fallbacks don't survive across
 * different function instances.
 *
 * Design:
 * - Write-through: every successful API write also caches locally
 * - Read fallback: when API reads fail or return empty, client checks cache
 * - Session-scoped: data clears on tab close (sessionStorage), matching demo envelope
 * - Source of truth: server when available, client when not
 */

import type { StoredChatThread, StoredChatThreadMeta, StoredChatMessage } from "@/lib/store/types"
import type { CodexTask } from "@/lib/codex/types"

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

const PREFIX = "scc:" // session chat cache
const THREADS_INDEX_KEY = `${PREFIX}threads`
const CODEX_TASKS_KEY = `${PREFIX}codex:tasks`

function threadKey(threadId: string): string {
  return `${PREFIX}thread:${threadId}`
}

function codexTaskKey(taskId: string): string {
  return `${PREFIX}codex:task:${taskId}`
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

function safeGet<T>(key: string): T | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function safeSet(key: string, value: unknown): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // sessionStorage full or unavailable — silently ignore
  }
}

function safeRemove(key: string): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Thread Cache
// ---------------------------------------------------------------------------

/** Strip messages from a full thread to produce metadata-only */
function toMeta(thread: StoredChatThread): StoredChatThreadMeta {
  const { messages: _messages, ...meta } = thread
  return meta
}

export const SessionChatCache = {
  // ----- Threads -----

  /** Cache a full thread (with messages) */
  saveThread(thread: StoredChatThread): void {
    safeSet(threadKey(thread.id), thread)
    // Also update the index
    const index = safeGet<string[]>(THREADS_INDEX_KEY) || []
    if (!index.includes(thread.id)) {
      index.push(thread.id)
      safeSet(THREADS_INDEX_KEY, index)
    }
  },

  /** Get a full thread by ID */
  getThread(threadId: string): StoredChatThread | null {
    return safeGet<StoredChatThread>(threadKey(threadId))
  },

  /** Append a message to a cached thread */
  appendMessage(threadId: string, message: StoredChatMessage): void {
    const thread = safeGet<StoredChatThread>(threadKey(threadId))
    if (!thread) return
    thread.messages.push(message)
    thread.updatedAt = Date.now()
    safeSet(threadKey(threadId), thread)
  },

  /** Update thread metadata fields */
  updateThread(threadId: string, updates: Partial<StoredChatThread>): void {
    const thread = safeGet<StoredChatThread>(threadKey(threadId))
    if (!thread) return
    Object.assign(thread, updates, { updatedAt: Date.now() })
    safeSet(threadKey(threadId), thread)
  },

  /** Delete a thread from cache */
  deleteThread(threadId: string): void {
    safeRemove(threadKey(threadId))
    const index = safeGet<string[]>(THREADS_INDEX_KEY) || []
    const filtered = index.filter((id) => id !== threadId)
    safeSet(THREADS_INDEX_KEY, filtered)
  },

  /** List all cached thread metadata (no messages) */
  listThreads(): StoredChatThreadMeta[] {
    const index = safeGet<string[]>(THREADS_INDEX_KEY) || []
    const metas: StoredChatThreadMeta[] = []
    for (const id of index) {
      const thread = safeGet<StoredChatThread>(threadKey(id))
      if (thread) metas.push(toMeta(thread))
    }
    metas.sort((a, b) => b.updatedAt - a.updatedAt)
    return metas
  },

  /** Get all cached full threads (for /find fallback) */
  listFullThreads(): StoredChatThread[] {
    const index = safeGet<string[]>(THREADS_INDEX_KEY) || []
    const threads: StoredChatThread[] = []
    for (const id of index) {
      const thread = safeGet<StoredChatThread>(threadKey(id))
      if (thread) threads.push(thread)
    }
    threads.sort((a, b) => b.updatedAt - a.updatedAt)
    return threads
  },

  // ----- Codex Tasks -----

  /** Cache a codex task */
  saveTask(task: CodexTask): void {
    safeSet(codexTaskKey(task.id), task)
    const index = safeGet<string[]>(CODEX_TASKS_KEY) || []
    if (!index.includes(task.id)) {
      index.push(task.id)
      safeSet(CODEX_TASKS_KEY, index)
    }
  },

  /** Get a cached codex task */
  getTask(taskId: string): CodexTask | null {
    return safeGet<CodexTask>(codexTaskKey(taskId))
  },

  /** List all cached codex tasks */
  listTasks(): CodexTask[] {
    const index = safeGet<string[]>(CODEX_TASKS_KEY) || []
    const tasks: CodexTask[] = []
    for (const id of index) {
      const task = safeGet<CodexTask>(codexTaskKey(id))
      if (task) tasks.push(task)
    }
    tasks.sort((a, b) => b.createdAt - a.createdAt)
    return tasks
  },
}
