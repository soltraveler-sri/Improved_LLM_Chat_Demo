import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { getChatStore } from "@/lib/store"

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

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 }
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

    // Call OpenAI to generate summary
    const openai = new OpenAI({ apiKey })
    const model = process.env.OPENAI_SUMMARY_MODEL || "gpt-4o-mini"

    console.log(
      `[Summary] Generating summary for chat ${id} with model ${model}`
    )

    const response = await openai.responses.create({
      model,
      input: prompt,
      store: false,
      // Use fast reasoning
      reasoning: { effort: "none" },
    })

    // Extract summary from response
    let summary = ""
    if (response.output && response.output.length > 0) {
      for (const item of response.output) {
        if (item.type === "message" && item.content) {
          for (const content of item.content) {
            if (content.type === "output_text") {
              summary = content.text.trim()
              break
            }
          }
        }
      }
    }

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

    const errorMessage =
      error instanceof Error ? error.message : "Failed to get summary"

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
