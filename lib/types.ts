/**
 * Chat message types for the LLM Chat Demo
 */

export interface ChatMessage {
  /** Unique local identifier (UUID) */
  localId: string
  /** Message role */
  role: "user" | "assistant" | "context"
  /** Message text content */
  text: string
  /** Timestamp (Unix ms) */
  createdAt: number
  /** OpenAI response ID - only present for assistant messages */
  responseId?: string
}

export interface MainThreadState {
  /** All messages in the main thread */
  messages: ChatMessage[]
  /** The response ID of the last assistant message (for chaining) */
  lastResponseId: string | null
}

/**
 * Branch thread model - represents a side conversation forked from an assistant message
 */
export interface BranchThread {
  /** Unique identifier (UUID) */
  id: string
  /** The localId of the parent assistant message in main thread */
  parentAssistantLocalId: string
  /** The responseId of the parent assistant message (fork point) */
  parentAssistantResponseId: string
  /** Branch title (e.g., "Branch 1" or derived from first user message) */
  title: string
  /** Creation timestamp (Unix ms) */
  createdAt: number
  /** Last update timestamp (Unix ms) */
  updatedAt: number
  /** Response mode for this branch */
  mode: "fast" | "deep"
  /** Whether to include this branch in main chat context (UI toggle; behavior in PR #4) */
  includeInMain: boolean
  /** How to include in main: summary or full (advanced control for PR #4) */
  includeMode: "summary" | "full"
  /** Messages within this branch */
  messages: ChatMessage[]
  /** The response ID of the last assistant message in this branch (for chaining) */
  lastResponseId: string | null
}

/**
 * API request/response types
 */
export interface RespondRequest {
  input: string
  previous_response_id?: string | null
  mode?: "fast" | "deep"
}

export interface RespondResponse {
  id: string
  output_text: string
}
