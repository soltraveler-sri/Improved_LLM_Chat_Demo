/**
 * Unified store exports with resilient fallback behavior
 *
 * Store selection:
 * 1. If Redis env vars are present → use Redis store
 * 2. Else → use memory store (with warning in production)
 *
 * Supports both env var patterns:
 * - KV_REST_API_URL + KV_REST_API_TOKEN (Vercel KV style)
 * - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (Upstash official)
 *
 * The app should never "brick" itself due to missing configuration.
 * Instead, we fall back gracefully and expose status for UI warnings.
 */

import type { ChatStore } from "./store"
import type { CodexStore } from "../codex/store"
import {
  isRedisConfigured,
  getStorageMode,
  getStorageBackend,
  getStorageDebugInfo,
  type StorageMode,
  type StorageBackend,
} from "./redis-client"

/**
 * Storage type indicator for UI (kept for backwards compatibility)
 */
export type StorageType = "kv" | "memory"

/**
 * Check if Redis is available (any supported env vars set)
 * Supports both Vercel KV and Upstash Redis patterns
 */
export { isRedisConfigured }

/**
 * Backwards compatible alias
 */
export function isKvAvailable(): boolean {
  return isRedisConfigured()
}

/**
 * Check if we're in development mode
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development"
}

/**
 * Get the current storage type for UI display
 * Returns "kv" for backwards compatibility when Redis is configured
 */
export function getStorageType(): StorageType {
  return isRedisConfigured() ? "kv" : "memory"
}

/**
 * Get storage info for API responses
 */
export function getStorageInfo(): {
  storageType: StorageType
  kvConfigured: boolean
  mode: StorageMode
  backend: StorageBackend
  detectedEnvKeys: string[]
  warning?: string
} {
  const debugInfo = getStorageDebugInfo()
  const storageType = debugInfo.configured ? "kv" : "memory"

  if (debugInfo.configured) {
    return {
      storageType,
      kvConfigured: true,
      mode: debugInfo.mode,
      backend: debugInfo.backend,
      detectedEnvKeys: debugInfo.detectedEnvKeys,
    }
  }

  // Memory store - include warning
  const warning = isDevelopment()
    ? "Using in-memory store (development mode). Data will reset on server restart."
    : "Storage is running in demo-local mode. History may reset on refresh. Configure Redis for reliable persistence."

  return {
    storageType,
    kvConfigured: false,
    mode: debugInfo.mode,
    backend: debugInfo.backend,
    detectedEnvKeys: debugInfo.detectedEnvKeys,
    warning,
  }
}

// Log once when memory store is used in production
let memoryWarningLogged = false

/**
 * Log a warning when using memory store in production (only once)
 */
function warnIfMemoryInProduction(): void {
  if (!isRedisConfigured() && !isDevelopment() && !memoryWarningLogged) {
    console.warn(
      "[Store] WARNING: Using in-memory store in production. " +
        "Data will not persist across requests/restarts. " +
        "Configure Redis env vars (KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN) for durable storage."
    )
    memoryWarningLogged = true
  }
}

// Re-export storage mode helpers
export { getStorageMode, getStorageBackend, getStorageDebugInfo }
export type { StorageMode, StorageBackend }

// Lazy imports to avoid circular dependencies
let _chatStoreModule: typeof import("./store") | null = null
let _codexStoreModule: typeof import("../codex/store") | null = null

async function getChatStoreModule() {
  if (!_chatStoreModule) {
    _chatStoreModule = await import("./store")
  }
  return _chatStoreModule
}

async function getCodexStoreModule() {
  if (!_codexStoreModule) {
    _codexStoreModule = await import("../codex/store")
  }
  return _codexStoreModule
}

/**
 * Get the chat store instance
 * Falls back to memory store if KV is not configured (with warning in production)
 */
export async function getChatStoreAsync(): Promise<ChatStore> {
  warnIfMemoryInProduction()
  const mod = await getChatStoreModule()
  return mod.getChatStore()
}

/**
 * Get the codex store instance
 * Falls back to memory store if KV is not configured (with warning in production)
 */
export async function getCodexStoreAsync(): Promise<CodexStore> {
  warnIfMemoryInProduction()
  const mod = await getCodexStoreModule()
  return mod.getCodexStore()
}

/**
 * Synchronous version for existing code
 * These are kept for backwards compatibility but the async versions are preferred
 */
export function getChatStore(): ChatStore {
  warnIfMemoryInProduction()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("./store") as typeof import("./store")
  return mod.getChatStore()
}

export function getCodexStore(): CodexStore {
  warnIfMemoryInProduction()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("../codex/store") as typeof import("../codex/store")
  return mod.getCodexStore()
}

// Re-export types
export type { ChatStore } from "./store"
export type { CodexStore } from "../codex/store"
export * from "./types"
