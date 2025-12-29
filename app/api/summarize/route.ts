import { NextRequest, NextResponse } from "next/server"
import {
  createTextResponse,
  extractTextOutput,
  formatOpenAIError,
} from "@/lib/openai"

export const runtime = "nodejs"

const SUMMARIZE_PROMPT = `Summarize the following conversation into 3-5 short bullet points.
Focus on:
- Key decisions made
- Important facts discovered
- Conclusions reached

Be extremely concise. No fluff. Plain text only.
Format as bullet points starting with "•".`

interface SummarizeRequest {
  branchMessages: Array<{ role: "user" | "assistant"; text: string }>
  maxBullets?: number
}

export async function POST(request: NextRequest) {
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
      .join("\n\n")

    const maxBullets = body.maxBullets || 5
    const prompt = `${SUMMARIZE_PROMPT}\n\nLimit to ${maxBullets} bullets maximum.\n\nConversation:\n${transcript}`

    // Use centralized client for summarization
    const response = await createTextResponse({
      kind: "summarize",
      input: [{ role: "user", content: prompt }],
      instructions: "You are a concise summarizer. Output only bullet points, nothing else.",
    })

    const outputText = extractTextOutput(response)

    return NextResponse.json({
      summary: outputText.trim(),
    })
  } catch (error) {
    console.error("Summarize API error:", error)

    const errorResponse = formatOpenAIError(error, "summarize")
    return NextResponse.json(errorResponse, { status: 500 })
  }
}
