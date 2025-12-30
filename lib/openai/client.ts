/**
 * Centralized OpenAI client and request configuration
 *
 * This module provides:
 * - Singleton OpenAI client
 * - Request kind-based configuration (model, reasoning, verbosity)
 * - Safe parameter handling (no unsupported params)
 * - Consistent error handling
 *
 * Key principles:
 * - GPT-5 series requires reasoning.effort >= "low" (NOT "none")
 * - Never send temperature, top_p, or max_output_tokens
 * - Use text.verbosity for response length control
 */

import OpenAI from "openai"
import { z } from "zod"
import { zodTextFormat } from "openai/helpers/zod"

// =============================================================================
// Request Kinds
// =============================================================================

/**
 * Request kinds with pre-configured settings
 *
 * Each kind has appropriate model, reasoning effort, and verbosity defaults.
 */
export type RequestKind =
  | "chat_fast" // Fast chat responses (reasoning: low)
  | "chat_deep" // Deep chat responses (reasoning: medium)
  | "summarize" // Summarization tasks (gpt-5-nano, reasoning: low)
  | "intent" // Intent classification (gpt-5-nano, reasoning: low)
  | "stacks" // Smart Stacks categorization (gpt-5-nano, reasoning: low)
  | "finder" // Chat finder reranking (gpt-5-mini, reasoning: low)
  | "codex" // Codex tasks (gpt-5.1-codex-mini, reasoning: medium)

/**
 * Request kinds that use previous_response_id chaining.
 * These MUST use store: true and the same underlying model.
 */
const CHAINED_KINDS: Set<RequestKind> = new Set(["chat_fast", "chat_deep"])

// =============================================================================
// Configuration
// =============================================================================

/**
 * Default models for each request kind
 * Note: chat_fast and chat_deep share the same model via getChainedChatModel()
 */
const DEFAULT_MODELS: Record<RequestKind, string> = {
  chat_fast: "gpt-5-mini", // Both chat kinds use the same model for chaining
  chat_deep: "gpt-5-mini", // Both chat kinds use the same model for chaining
  summarize: "gpt-5-nano",
  intent: "gpt-5-nano",
  stacks: "gpt-5-nano",
  finder: "gpt-5-mini",
  codex: "gpt-5.1-codex-mini",
}

/**
 * Environment variable names for model overrides
 */
const MODEL_ENV_VARS: Record<RequestKind, string> = {
  chat_fast: "OPENAI_MODEL_FAST",
  chat_deep: "OPENAI_MODEL_DEEP",
  summarize: "OPENAI_MODEL_SUMMARIZE",
  intent: "OPENAI_MODEL_INTENT",
  stacks: "OPENAI_MODEL_STACKS",
  finder: "OPENAI_MODEL_FINDER",
  codex: "OPENAI_MODEL_CODEX",
}

// Track if we've already warned about model mismatch (to avoid spamming logs)
let chainedModelWarningLogged = false

/**
 * Get the unified model for chained chat requests.
 *
 * This ensures chat_fast and chat_deep use the SAME underlying model,
 * which is required for previous_response_id chaining to work reliably.
 *
 * Priority:
 * 1. OPENAI_MODEL_CHAT (explicit unified override)
 * 2. OPENAI_MODEL_DEEP (prefer the "deep" model for quality)
 * 3. OPENAI_MODEL_FAST (fallback)
 * 4. Default: gpt-5-mini
 */
export function getChainedChatModel(): string {
  // Priority 1: Explicit unified chat model
  const chatModel = process.env.OPENAI_MODEL_CHAT
  if (chatModel) {
    return chatModel
  }

  const fastModel = process.env.OPENAI_MODEL_FAST
  const deepModel = process.env.OPENAI_MODEL_DEEP

  // If both are configured differently, warn and use deep model
  if (fastModel && deepModel && fastModel !== deepModel) {
    if (!chainedModelWarningLogged) {
      console.warn(
        `[OpenAI] Warning: OPENAI_MODEL_FAST (${fastModel}) != OPENAI_MODEL_DEEP (${deepModel}). ` +
        `Using ${deepModel} for both to ensure previous_response_id chaining works. ` +
        `Set OPENAI_MODEL_CHAT to explicitly configure the unified chat model.`
      )
      chainedModelWarningLogged = true
    }
    return deepModel
  }

  // Priority 2: Deep model
  if (deepModel) {
    return deepModel
  }

  // Priority 3: Fast model
  if (fastModel) {
    return fastModel
  }

  // Default
  return DEFAULT_MODELS.chat_deep
}

/**
 * Reasoning effort for each request kind
 *
 * IMPORTANT: GPT-5 series models do NOT support "none" - minimum is "low"
 * Only use "low", "medium", or "high"
 */
const REASONING_EFFORT: Record<RequestKind, "low" | "medium" | "high"> = {
  chat_fast: "low",
  chat_deep: "high",
  summarize: "low",
  intent: "low",
  stacks: "low",
  finder: "low",
  codex: "medium", // Codex needs medium for quality code generation
}

/**
 * Text verbosity for each request kind
 */
const TEXT_VERBOSITY: Record<RequestKind, "low" | "medium" | "high"> = {
  chat_fast: "low",
  chat_deep: "low",
  summarize: "low",
  intent: "low",
  stacks: "low",
  finder: "low",
  codex: "medium", // Codex needs more verbose output for explanations
}

// =============================================================================
// Client
// =============================================================================

let openaiClient: OpenAI | null = null

/**
 * Get the singleton OpenAI client
 * Throws if OPENAI_API_KEY is not configured
 */
export function getOpenAIClient(): OpenAI {
  if (openaiClient) {
    return openaiClient
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured")
  }

  openaiClient = new OpenAI({ apiKey })
  return openaiClient
}

// =============================================================================
// Configuration Helpers
// =============================================================================

/**
 * Get the model for a request kind
 *
 * For chained kinds (chat_fast, chat_deep), this returns the unified
 * chat model to ensure previous_response_id chaining works correctly.
 */
export function getModel(kind: RequestKind): string {
  // Chained kinds must use the same model
  if (CHAINED_KINDS.has(kind)) {
    return getChainedChatModel()
  }

  const envVar = MODEL_ENV_VARS[kind]
  return process.env[envVar] || DEFAULT_MODELS[kind]
}

/**
 * Get the reasoning effort for a request kind
 */
export function getReasoningEffort(kind: RequestKind): "low" | "medium" | "high" {
  return REASONING_EFFORT[kind]
}

/**
 * Get the text verbosity for a request kind
 */
export function getTextVerbosity(kind: RequestKind): "low" | "medium" | "high" {
  return TEXT_VERBOSITY[kind]
}

/**
 * Get configuration info for logging
 */
export function getConfigInfo(kind: RequestKind): {
  model: string
  reasoning: string
  verbosity: string
} {
  return {
    model: getModel(kind),
    reasoning: getReasoningEffort(kind),
    verbosity: getTextVerbosity(kind),
  }
}

// =============================================================================
// Request Builders
// =============================================================================

/**
 * Non-streaming response create params
 */
type NonStreamingResponseParams = OpenAI.Responses.ResponseCreateParamsNonStreaming

/**
 * Build common request parameters for a given kind
 *
 * This function ensures:
 * - Correct model is selected
 * - Reasoning effort is always "low" or higher (never "none")
 * - Text verbosity is set appropriately
 * - No unsupported parameters are sent
 * - Chained kinds (chat_fast, chat_deep) use store: true for previous_response_id
 */
function buildCommonParams(
  kind: RequestKind,
  input: string | OpenAI.Responses.ResponseInput,
  options?: {
    previousResponseId?: string | null
    instructions?: string
  }
): NonStreamingResponseParams {
  const model = getModel(kind)
  const reasoning = getReasoningEffort(kind)
  const verbosity = getTextVerbosity(kind)

  // Chained kinds MUST use store: true for previous_response_id to work.
  // This applies to EVERY turn of the chain, including the first turn,
  // otherwise the next turn cannot reference this response ID.
  const shouldStore = CHAINED_KINDS.has(kind)

  const params: NonStreamingResponseParams = {
    model,
    input,
    store: shouldStore,
    stream: false,
    reasoning: { effort: reasoning },
    text: {
      format: { type: "text" },
      verbosity,
    },
  }

  if (options?.previousResponseId) {
    params.previous_response_id = options.previousResponseId
  }

  if (options?.instructions) {
    params.instructions = options.instructions
  }

  return params
}

/**
 * Create a text response request
 */
export async function createTextResponse(options: {
  kind: RequestKind
  input: string | OpenAI.Responses.ResponseInput
  previousResponseId?: string | null
  instructions?: string
}): Promise<OpenAI.Responses.Response> {
  const client = getOpenAIClient()
  const params = buildCommonParams(options.kind, options.input, {
    previousResponseId: options.previousResponseId,
    instructions: options.instructions,
  })

  const config = getConfigInfo(options.kind)
  console.log(`[OpenAI:${options.kind}] Request:`, {
    model: config.model,
    reasoning: config.reasoning,
    verbosity: config.verbosity,
    hasPreviousResponseId: !!options.previousResponseId,
  })

  try {
    const response = await client.responses.create(params)

    console.log(`[OpenAI:${options.kind}] Response:`, {
      id: response.id,
      status: response.status,
      model: response.model,
    })

    return response
  } catch (error) {
    handleOpenAIError(error, options.kind, config)
    throw error
  }
}

/**
 * Create a parsed (structured output) response request
 */
export async function createParsedResponse<T extends z.ZodType>(options: {
  kind: RequestKind
  input: string | OpenAI.Responses.ResponseInput
  schema: T
  schemaName: string
  previousResponseId?: string | null
  instructions?: string
}): Promise<{
  response: OpenAI.Responses.Response
  parsed: z.infer<T> | null
}> {
  const client = getOpenAIClient()
  const model = getModel(options.kind)
  const reasoning = getReasoningEffort(options.kind)

  const config = getConfigInfo(options.kind)
  console.log(`[OpenAI:${options.kind}] Parse request:`, {
    model: config.model,
    reasoning: config.reasoning,
    schema: options.schemaName,
  })

  try {
    const response = await client.responses.parse({
      model,
      input: options.input,
      store: false,
      reasoning: { effort: reasoning },
      text: {
        format: zodTextFormat(options.schema, options.schemaName),
      },
    })

    console.log(`[OpenAI:${options.kind}] Parse response:`, {
      id: response.id,
      status: response.status,
      model: response.model,
      hasParsed: !!response.output_parsed,
    })

    return {
      response,
      parsed: response.output_parsed as z.infer<T> | null,
    }
  } catch (error) {
    handleOpenAIError(error, options.kind, config)
    throw error
  }
}

// =============================================================================
// Error Handling
// =============================================================================

/**
 * Handle OpenAI API errors with detailed logging
 */
function handleOpenAIError(
  error: unknown,
  kind: RequestKind,
  config: { model: string; reasoning: string; verbosity: string }
): void {
  if (error instanceof OpenAI.APIError) {
    console.error(`[OpenAI:${kind}] API Error:`, {
      route: kind,
      model: config.model,
      reasoning: config.reasoning,
      verbosity: config.verbosity,
      status: error.status,
      message: error.message,
      code: error.code,
      requestId: error.headers?.["x-request-id"],
    })
  } else {
    console.error(`[OpenAI:${kind}] Unknown Error:`, error)
  }
}

/**
 * Format an OpenAI error for API response
 */
export function formatOpenAIError(error: unknown, kind: RequestKind): {
  error: string
  details?: {
    route: string
    model: string
    reasoning: string
  }
} {
  const config = getConfigInfo(kind)

  if (error instanceof OpenAI.APIError) {
    return {
      error: `OpenAI API error: ${error.message}`,
      details: {
        route: kind,
        model: config.model,
        reasoning: config.reasoning,
      },
    }
  }

  return {
    error: error instanceof Error ? error.message : "Unknown error",
  }
}

// =============================================================================
// Response Helpers
// =============================================================================

/**
 * Extract text output from a response
 */
export function extractTextOutput(response: OpenAI.Responses.Response): string {
  // Try output_text first (convenience property)
  if (response.output_text) {
    return response.output_text
  }

  // Fall back to extracting from output array
  if (response.output) {
    for (const item of response.output) {
      if (item.type === "message" && item.content) {
        for (const content of item.content) {
          if (content.type === "output_text") {
            return content.text
          }
        }
      }
    }
  }

  return ""
}
