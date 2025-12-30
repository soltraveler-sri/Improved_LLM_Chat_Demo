/**
 * Flexible Redis client factory
 * 
 * Supports multiple env var patterns for Redis/KV configuration:
 * 1. KV_REST_API_URL + KV_REST_API_TOKEN (Vercel KV style)
 * 2. UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (Upstash official)
 * 
 * This allows the app to work with both Vercel KV and Upstash Redis integrations.
 */

import { createClient, type VercelKV } from "@vercel/kv"

/**
 * Storage backend types
 */
export type StorageBackend = "upstash" | "vercel_kv" | "memory"

/**
 * Storage mode types
 */
export type StorageMode = "redis" | "memory"

/**
 * Environment variable detection result
 */
export interface RedisEnvConfig {
  /** Which env vars were found */
  backend: StorageBackend
  /** Whether Redis is configured (backend is not "memory") */
  configured: boolean
  /** URL for Redis REST API */
  url?: string
  /** Token for Redis REST API */
  token?: string
  /** List of env var names that were detected (no values, for debugging) */
  detectedEnvKeys: string[]
}

/**
 * Detect which Redis env vars are available
 * Priority: Upstash official > Vercel KV
 */
export function detectRedisEnv(): RedisEnvConfig {
  const detectedEnvKeys: string[] = []
  
  // Check Upstash official pattern first (used by Vercel Redis integration)
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN
  
  if (upstashUrl) detectedEnvKeys.push("UPSTASH_REDIS_REST_URL")
  if (upstashToken) detectedEnvKeys.push("UPSTASH_REDIS_REST_TOKEN")
  
  if (upstashUrl && upstashToken) {
    return {
      backend: "upstash",
      configured: true,
      url: upstashUrl,
      token: upstashToken,
      detectedEnvKeys,
    }
  }
  
  // Check Vercel KV pattern
  const kvUrl = process.env.KV_REST_API_URL
  const kvToken = process.env.KV_REST_API_TOKEN
  
  if (kvUrl) detectedEnvKeys.push("KV_REST_API_URL")
  if (kvToken) detectedEnvKeys.push("KV_REST_API_TOKEN")
  
  if (kvUrl && kvToken) {
    return {
      backend: "vercel_kv",
      configured: true,
      url: kvUrl,
      token: kvToken,
      detectedEnvKeys,
    }
  }
  
  // No Redis configured
  return {
    backend: "memory",
    configured: false,
    detectedEnvKeys,
  }
}

/**
 * Check if any Redis/KV env vars are configured
 */
export function isRedisConfigured(): boolean {
  const config = detectRedisEnv()
  return config.configured
}

/**
 * Get storage mode based on env var detection
 */
export function getStorageMode(): StorageMode {
  return isRedisConfigured() ? "redis" : "memory"
}

/**
 * Get storage backend name for diagnostics
 */
export function getStorageBackend(): StorageBackend {
  return detectRedisEnv().backend
}

/**
 * Singleton Redis client instance
 */
let redisClient: VercelKV | null = null
let clientInitLogged = false

/**
 * Get or create the Redis client
 * Returns null if Redis is not configured
 */
export function getRedisClient(): VercelKV | null {
  if (redisClient) return redisClient
  
  const config = detectRedisEnv()
  
  if (!config.configured || !config.url || !config.token) {
    return null
  }
  
  redisClient = createClient({
    url: config.url,
    token: config.token,
  })
  
  if (!clientInitLogged) {
    console.log(`[Redis] Initialized client (backend: ${config.backend})`)
    clientInitLogged = true
  }
  
  return redisClient
}

/**
 * Get detailed storage info for API responses and debugging
 */
export function getStorageDebugInfo(): {
  mode: StorageMode
  backend: StorageBackend
  detectedEnvKeys: string[]
  configured: boolean
} {
  const config = detectRedisEnv()
  return {
    mode: config.configured ? "redis" : "memory",
    backend: config.backend,
    detectedEnvKeys: config.detectedEnvKeys,
    configured: config.configured,
  }
}
