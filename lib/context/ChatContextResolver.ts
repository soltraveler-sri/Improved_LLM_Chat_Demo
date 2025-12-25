/**
 * Chat Context Resolver Interface
 *
 * This interface defines how past chat context can be resolved
 * for injection into new messages.
 *
 * In this demo, we implement SummaryResolver which uses whole-chat summaries.
 * A production system would use RetrievalResolver with semantic search.
 */

/**
 * Resolved context from a past chat
 */
export interface ResolvedContext {
  chatId: string
  title: string
  category: string
  content: string
  /** How the context was resolved */
  method: "summary" | "retrieval"
}

/**
 * Base interface for context resolvers
 */
export interface ChatContextResolver {
  /**
   * Resolve context from a past chat given the current query
   *
   * @param chatId - The ID of the chat to resolve context from
   * @param query - The current user query (used for relevance in retrieval mode)
   * @returns Resolved context or null if unavailable
   */
  resolve(chatId: string, query: string): Promise<ResolvedContext | null>
}

/**
 * Summary-based context resolver
 *
 * This resolver returns the whole-chat summary.
 * Simple but may include irrelevant information.
 *
 * Used in this demo.
 */
export class SummaryResolver implements ChatContextResolver {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async resolve(chatId: string, query: string): Promise<ResolvedContext | null> {
    try {
      const res = await fetch(`/api/chats/${chatId}/summary`)
      if (!res.ok) return null

      const data = await res.json()
      return {
        chatId,
        title: data.title,
        category: data.category,
        content: data.summary,
        method: "summary",
      }
    } catch {
      return null
    }
  }
}

/**
 * Retrieval-based context resolver (STUB)
 *
 * This resolver would use semantic search to find only the
 * relevant snippets from a past chat based on the current query.
 *
 * Production implementation would:
 * 1. Embed the current query
 * 2. Search the chat's message embeddings
 * 3. Return top-k relevant message snippets
 *
 * This is more accurate than summaries but requires:
 * - Embedding storage (vector DB)
 * - Embedding generation on message creation
 * - Semantic search infrastructure
 *
 * NOT IMPLEMENTED in this demo.
 */
export class RetrievalResolver implements ChatContextResolver {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async resolve(chatId: string, query: string): Promise<ResolvedContext | null> {
    // STUB: Production would implement semantic retrieval here
    console.warn(
      "[RetrievalResolver] Not implemented. Use SummaryResolver for demo."
    )
    return null
  }
}

/**
 * Factory function to get the appropriate resolver
 *
 * In production, this could be configured via environment variables
 * or feature flags.
 */
export function getContextResolver(): ChatContextResolver {
  // For this demo, always use summary-based resolution
  return new SummaryResolver()
}
