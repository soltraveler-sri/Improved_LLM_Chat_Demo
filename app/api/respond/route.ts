import { NextRequest, NextResponse } from "next/server"
import {
  createTextResponse,
  extractTextOutput,
  formatOpenAIError,
  getConfigInfo,
  type RequestKind,
} from "@/lib/openai"

export const runtime = "nodejs"

const SYSTEM_INSTRUCTIONS = `You are a helpful, concise assistant. Keep responses brief and focused. Avoid lengthy explanations unless specifically asked for detail. Be direct and practical.`

interface RespondRequest {
  input: string
  previous_response_id?: string | null
  mode?: "fast" | "deep"
}

export async function POST(request: NextRequest) {
  let kind: RequestKind = "chat_deep"

  try {
    const body = (await request.json()) as RespondRequest

    if (!body.input || typeof body.input !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'input' field" },
        { status: 400 }
      )
    }

    // Determine request kind based on mode
    const mode = body.mode || "deep"
    kind = mode === "fast" ? "chat_fast" : "chat_deep"

    const config = getConfigInfo(kind)
    console.log(`[Respond] Using ${kind} mode:`, config)

    // Use centralized client for the request
    const response = await createTextResponse({
      kind,
      input: [{ role: "user", content: body.input }],
      previousResponseId: body.previous_response_id,
      instructions: SYSTEM_INSTRUCTIONS,
    })

    const outputText = extractTextOutput(response)

    // Debug: Log if output is empty or incomplete
    if (!outputText) {
      console.warn("Empty output_text. Full response output:", JSON.stringify(response.output, null, 2))
    }

    if (response.status === "incomplete") {
      console.warn("Response incomplete:", {
        reason: response.incomplete_details,
      })
    }

    return NextResponse.json({
      id: response.id,
      output_text: outputText,
    })
  } catch (error) {
    console.error("API error:", error)

    const errorResponse = formatOpenAIError(error, kind)
    return NextResponse.json(errorResponse, { status: 500 })
  }
}
