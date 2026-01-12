import { NextRequest, NextResponse } from "next/server"
import {
  createSummarizeResponse,
  extractTextOutput,
  formatOpenAIError,
  getConfigInfo,
} from "@/lib/openai"

export const runtime = "nodejs"

/**
 * Summarization timeout in milliseconds (15 seconds)
 * This is a hard limit to ensure responsive UX
 */
const SUMMARIZE_TIMEOUT_MS = 15_000

/**
 * Fast, minimal prompt for short conversations (1-3 messages)
 */
const SUMMARIZE_PROMPT_SHORT = `Summarize in 1-2 bullet points. Be extremely brief. Format: "• point"`

/**
 * Standard prompt for longer conversations
 */
const SUMMARIZE_PROMPT_STANDARD = `Summarize in 2-4 brief bullet points. Key points only. Format: "• point"`

interface SummarizeRequest {
  branchMessages: Array<{ role: "user" | "assistant"; text: string }>
  maxBullets?: number
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = (await request.json()) as SummarizeRequest

    if (!body.branchMessages || !Array.isArray(body.branchMessages)) {
      return NextResponse.json(
        { error: "Missing or invalid 'branchMessages' field" },
        { status: 400 }
      )
    }

    if (body.branchMessages.length === 0) {
      return NextResponse.json({ summary: "" })
    }

    // Build conversation transcript for summarization
    const transcript = body.branchMessages
      .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.text}`)
      .join("\n")

    // Use shorter prompt for brief conversations (faster response)
    const isShortConversation = body.branchMessages.length <= 3
    const basePrompt = isShortConversation ? SUMMARIZE_PROMPT_SHORT : SUMMARIZE_PROMPT_STANDARD
    const prompt = `${basePrompt}\n\n${transcript}`

    // Create abort controller with timeout
    const abortController = new AbortController()
    const timeoutId = setTimeout(() => {
      abortController.abort()
    }, SUMMARIZE_TIMEOUT_MS)

    try {
      // Use optimized summarization with minimal reasoning + fallback
      // Uses store: false (summarization shouldn't affect chaining state)
      const config = getConfigInfo("summarize")
      
      // Dev-only instrumentation
      if (process.env.NODE_ENV === "development") {
        console.log(`[Summarize:route] Starting summarization`, {
          messageCount: body.branchMessages.length,
          transcriptLength: transcript.length,
          model: config.model,
          reasoning: config.reasoning,
        })
      }

      const { response, durationMs, reasoningUsed, timedOut } = await createSummarizeResponse({
        input: [{ role: "user", content: prompt }],
        instructions: "You are a concise summarizer. Output only bullet points, nothing else.",
        abortSignal: abortController.signal,
      })

      clearTimeout(timeoutId)

      const outputText = extractTextOutput(response)

      // Dev-only instrumentation logging
      if (process.env.NODE_ENV === "development") {
        console.log(`[Summarize:route] Complete`, {
          durationMs,
          reasoningUsed,
          timedOut,
          summaryLength: outputText.length,
          // IMPORTANT: Never log tokens or API keys
        })
      }

      return NextResponse.json({
        summary: outputText.trim(),
      })
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (error) {
    const totalDurationMs = Date.now() - startTime

    // Check if this was a timeout
    if (error instanceof Error && error.name === "AbortError") {
      console.error(`[Summarize:route] Timeout after ${totalDurationMs}ms`)
      return NextResponse.json(
        { 
          error: "Summarization timed out",
          timeout: true,
          durationMs: totalDurationMs,
        },
        { status: 504 }
      )
    }

    console.error("Summarize API error:", error)

    const errorResponse = formatOpenAIError(error, "summarize")
    return NextResponse.json(errorResponse, { status: 500 })
  }
}
