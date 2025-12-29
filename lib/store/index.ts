/**
 * Unified store exports with proper selection rules
 *
 * Store selection:
 * 1. If KV env vars are present → use KV store
 * 2. Else if NODE_ENV === "development" → use memory store
 * 3. Else (production / Vercel) → throw error
 */

import type { ChatStore } from "./store"
import type { CodexStore } from "../codex/store"

/**
 * Storage type indicator for UI
 */
export type StorageType = "kv" | "memory" | "error"

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
  if (isKvAvailable()) {
    return "kv"
  }
  if (isDevelopment()) {
    return "memory"
  }
  return "error"
}

/**
 * Get storage info for API responses
 */
export function getStorageInfo(): {
  type: StorageType
  available: boolean
  message: string
} {
  const type = getStorageType()

  switch (type) {
    case "kv":
      return {
        type: "kv",
        available: true,
        message: "Using Vercel KV store",
      }
    case "memory":
      return {
        type: "memory",
        available: true,
        message: "Using in-memory store (development only)",
      }
    case "error":
      return {
        type: "error",
        available: false,
        message:
          "KV not configured; demo history will be unreliable. Configure KV_REST_API_URL + KV_REST_API_TOKEN",
      }
  }
}

/**
 * Throw if KV is not configured in production
 */
function assertStorageAvailable(): void {
  if (!isKvAvailable() && !isDevelopment()) {
    throw new Error(
      "KV not configured; demo history will be unreliable. " +
        "Configure KV_REST_API_URL + KV_REST_API_TOKEN environment variables."
    )
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
 * Throws in production if KV is not configured
 */
export async function getChatStoreAsync(): Promise<ChatStore> {
  assertStorageAvailable()
  const mod = await getChatStoreModule()
  return mod.getChatStore()
}

/**
 * Get the codex store instance
 * Throws in production if KV is not configured
 */
export async function getCodexStoreAsync(): Promise<CodexStore> {
  assertStorageAvailable()
  const mod = await getCodexStoreModule()
  return mod.getCodexStore()
}

/**
 * Synchronous version for existing code
 * These are kept for backwards compatibility but the async versions are preferred
 */
export function getChatStore(): ChatStore {
  assertStorageAvailable()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("./store") as typeof import("./store")
  return mod.getChatStore()
}

export function getCodexStore(): CodexStore {
  assertStorageAvailable()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("../codex/store") as typeof import("../codex/store")
  return mod.getCodexStore()
}

// Re-export types
export type { ChatStore } from "./store"
export type { CodexStore } from "../codex/store"
export * from "./types"
