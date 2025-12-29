import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import {
  getOpenAIClient,
  getModel,
  getReasoningEffort,
  getTextVerbosity,
  extractTextOutput,
  formatOpenAIError,
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

    const mode = body.mode || "deep"
    kind = mode === "fast" ? "chat_fast" : "chat_deep"

    const openai = getOpenAIClient()
    const model = getModel(kind)
    const reasoningEffort = getReasoningEffort(kind)
    const textVerbosity = getTextVerbosity(kind)

    const requestParams: OpenAI.Responses.ResponseCreateParams = {
      model,
      input: [{ role: "user", content: body.input }],
      instructions: SYSTEM_INSTRUCTIONS,
      store: true,
      reasoning: { effort: reasoningEffort },
      text: {
        format: { type: "text" },
        verbosity: textVerbosity,
      },
    }

    if (body.previous_response_id) {
      requestParams.previous_response_id = body.previous_response_id
    }

    // Debug: Log request params
    console.log(`[OpenAI:${kind}] Request:`, {
      model,
      reasoning: reasoningEffort,
      verbosity: textVerbosity,
      hasPreviousResponseId: !!requestParams.previous_response_id,
    })

    const response = await openai.responses.create(requestParams)

    // Debug: Log response structure
    console.log(`[OpenAI:${kind}] Response:`, {
      id: response.id,
      status: response.status,
      model: response.model,
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
