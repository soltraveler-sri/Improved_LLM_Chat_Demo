/**
 * Unified store exports with resilient fallback behavior
 *
 * Store selection:
 * 1. If KV env vars are present → use KV store
 * 2. Else → use memory store (with warning in production)
 *
 * The app should never "brick" itself due to missing KV configuration.
 * Instead, we fall back gracefully and expose status for UI warnings.
 */

import type { ChatStore } from "./store"
import type { CodexStore } from "../codex/store"

/**
 * Storage type indicator for UI
 */
export type StorageType = "kv" | "memory"

/**
 * Check if Vercel KV is available (env vars set)
 */
export function isKvAvailable(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

/**
 * Check if we're in development mode
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development"
}

/**
 * Get the current storage type for UI display
 */
export function getStorageType(): StorageType {
  return isKvAvailable() ? "kv" : "memory"
}

/**
 * Get storage info for API responses
 */
export function getStorageInfo(): {
  storageType: StorageType
  kvConfigured: boolean
  warning?: string
} {
  const storageType = getStorageType()
  const kvConfigured = isKvAvailable()

  if (kvConfigured) {
    return {
      storageType,
      kvConfigured,
    }
  }

  // Memory store - include warning
  const warning = isDevelopment()
    ? "Using in-memory store (development mode). Data will reset on server restart."
    : "Storage is running in demo memory mode. History may reset on refresh. Configure Vercel KV for reliable persistence."

  return {
    storageType,
    kvConfigured,
    warning,
  }
}

// Log once when memory store is used in production
let memoryWarningLogged = false

/**
 * Log a warning when using memory store in production (only once)
 */
function warnIfMemoryInProduction(): void {
  if (!isKvAvailable() && !isDevelopment() && !memoryWarningLogged) {
    console.warn(
      "[Store] WARNING: Using in-memory store in production. " +
        "Data will not persist across requests/restarts. " +
        "Configure KV_REST_API_URL + KV_REST_API_TOKEN for durable storage."
    )
    memoryWarningLogged = true
  }
}

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
