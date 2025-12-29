import { NextRequest, NextResponse } from "next/server"
import { getChatStore } from "@/lib/store"
import {
  createTextResponse,
  extractTextOutput,
  formatOpenAIError,
  getConfigInfo,
} from "@/lib/openai"

/**
 * Helper to get demo_uid from cookies
 */
function getDemoUid(request: NextRequest): string | null {
  return request.cookies.get("demo_uid")?.value ?? null
}

/**
 * Build a compact transcript from messages for summarization
 */
function buildTranscriptForSummary(
  messages: Array<{ role: string; text: string }>,
  maxMessages = 20,
  maxCharsPerMessage = 300
): string {
  const recentMessages = messages.slice(-maxMessages)
  return recentMessages
    .map((m) => {
      const role = m.role.toUpperCase()
      let text = m.text
      if (text.length > maxCharsPerMessage) {
        text = text.slice(0, maxCharsPerMessage) + "…"
      }
      return `${role}: ${text}`
    })
    .join("\n")
}

/**
 * GET /api/chats/[id]/summary - Get or generate summary for a chat
 *
 * If the chat already has a summary, returns it.
 * Otherwise, generates a new summary using OpenAI and saves it.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const demoUid = getDemoUid(request)

  if (!demoUid) {
    return NextResponse.json(
      { error: "No demo_uid cookie found" },
      { status: 401 }
    )
  }

  try {
    const { id } = await params
    const store = getChatStore()
    const thread = await store.getThread(demoUid, id)

    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 })
    }

    // If summary already exists, return it
    if (thread.summary) {
      return NextResponse.json({
        chatId: id,
        title: thread.title,
        category: thread.category,
        summary: thread.summary,
        generated: false,
      })
    }

    // No summary exists - generate one
    if (thread.messages.length === 0) {
      return NextResponse.json({
        chatId: id,
        title: thread.title,
        category: thread.category,
        summary: "No messages in this conversation.",
        generated: true,
      })
    }

    // Build transcript for summarization
    const transcript = buildTranscriptForSummary(thread.messages)

    const prompt = `Summarize the following conversation in 1-2 sentences. Focus on the main topic discussed and any key outcomes or conclusions.

Conversation:
${transcript}

Summary:`

    // Call OpenAI to generate summary using centralized client
    // Uses "summarize" kind: gpt-5-nano with reasoning: low (NOT "none"!)
    const config = getConfigInfo("summarize")
    console.log(
      `[Summary] Generating summary for chat ${id} with model ${config.model}`
    )

    const response = await createTextResponse({
      kind: "summarize",
      input: prompt,
    })

    // Extract summary from response
    let summary = extractTextOutput(response).trim()

    if (!summary) {
      console.warn("[Summary] Empty summary generated, using fallback")
      summary = "Summary unavailable."
    }

    // Save summary back to thread
    await store.updateThread(demoUid, id, { summary })

    return NextResponse.json({
      chatId: id,
      title: thread.title,
      category: thread.category,
      summary,
      generated: true,
    })
  } catch (error) {
    console.error("[GET /api/chats/[id]/summary] Error:", error)

    const errorResponse = formatOpenAIError(error, "summarize")
    return NextResponse.json(errorResponse, { status: 500 })
  }
}
