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
