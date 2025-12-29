/**
 * Centralized OpenAI client and request configuration
 *
 * This module provides:
 * - Singleton OpenAI client
 * - Request kind-based configuration
 * - Safe reasoning/verbosity parameters
 * - Consistent error handling
 */

import OpenAI from "openai"
import { z } from "zod"
import { zodTextFormat } from "openai/helpers/zod"

// =============================================================================
// Request Kinds
// =============================================================================

/**
 * Request kinds with pre-configured settings
 */
export type RequestKind =
  | "chat_fast" // Fast chat responses (gpt-5-nano, reasoning: low, verbosity: low)
  | "chat_deep" // Deep chat responses (gpt-5-mini, reasoning: medium, verbosity: low)
  | "summarize" // Summarization tasks (gpt-5-nano, reasoning: low, verbosity: low)
  | "intent" // Intent classification (gpt-5-nano, reasoning: low, verbosity: low)
  | "stacks" // Smart Stacks categorization (gpt-5-nano, reasoning: low, verbosity: low)
  | "finder" // Chat finder reranking (gpt-5-mini, reasoning: low, verbosity: low)
  | "codex" // Codex tasks (gpt-5.1-codex-mini, reasoning: medium)

// =============================================================================
// Configuration
// =============================================================================

/**
 * Default models for each request kind
 */
const DEFAULT_MODELS: Record<RequestKind, string> = {
  chat_fast: "gpt-5-nano",
  chat_deep: "gpt-5-mini",
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

/**
 * Reasoning effort for each request kind
 * Note: GPT-5 models require "low" or higher, NOT "none"
 */
const REASONING_EFFORT: Record<RequestKind, "low" | "medium" | "high"> = {
  chat_fast: "low",
  chat_deep: "medium",
  summarize: "low",
  intent: "low",
  stacks: "low",
  finder: "low",
  codex: "medium",
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
  codex: "medium",
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
 */
export function getModel(kind: RequestKind): string {
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

export interface BaseRequestOptions {
  kind: RequestKind
  input: string | OpenAI.Responses.ResponseInput
  previousResponseId?: string | null
  instructions?: string
}

export interface TextRequestOptions extends BaseRequestOptions {
  type: "text"
}

export interface ParseRequestOptions<T extends z.ZodType> extends BaseRequestOptions {
  type: "parse"
  schema: T
  schemaName: string
}

export type RequestOptions<T extends z.ZodType = z.ZodNever> =
  | TextRequestOptions
  | ParseRequestOptions<T>

/**
 * Non-streaming response create params
 */
type NonStreamingResponseParams = OpenAI.Responses.ResponseCreateParamsNonStreaming

/**
 * Build common request parameters for a given kind
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

  const params: NonStreamingResponseParams = {
    model,
    input,
    store: false,
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
