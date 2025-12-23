import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

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

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      )
    }

    const openai = new OpenAI({ apiKey })
    const model = process.env.OPENAI_MODEL || "gpt-4o"

    // Build conversation transcript for summarization
    const transcript = body.branchMessages
      .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.text}`)
      .join("\n\n")

    const maxBullets = body.maxBullets || 5
    const prompt = `${SUMMARIZE_PROMPT}\n\nLimit to ${maxBullets} bullets maximum.\n\nConversation:\n${transcript}`

    // Use Responses API without previous_response_id (stateless summarize)
    const response = await openai.responses.create({
      model,
      input: [{ role: "user", content: prompt }],
      instructions: "You are a concise summarizer. Output only bullet points, nothing else.",
      max_output_tokens: 300,
      // No previous_response_id - stateless call
      // No reasoning effort - simple task
    })

    const outputText =
      response.output_text ||
      response.output
        ?.filter((item): item is OpenAI.Responses.ResponseOutputMessage =>
          item.type === "message"
        )
        .flatMap((msg) =>
          msg.content
            .filter((c): c is OpenAI.Responses.ResponseOutputText =>
              c.type === "output_text"
            )
            .map((c) => c.text)
        )
        .join("") ||
      ""

    return NextResponse.json({
      summary: outputText.trim(),
    })
  } catch (error) {
    console.error("Summarize API error:", error)

    if (error instanceof OpenAI.APIError) {
      return NextResponse.json(
        { error: `OpenAI API error: ${error.message}` },
        { status: error.status || 500 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
