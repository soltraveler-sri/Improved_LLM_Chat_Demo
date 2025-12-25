import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

export const runtime = "nodejs"

const SYSTEM_INSTRUCTIONS = `You are a helpful, concise assistant. Keep responses brief and focused. Avoid lengthy explanations unless specifically asked for detail. Be direct and practical.`

interface RespondRequest {
  input: string
  previous_response_id?: string | null
  mode?: "fast" | "deep"
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RespondRequest

    if (!body.input || typeof body.input !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'input' field" },
        { status: 400 }
      )
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
    const mode = body.mode || "deep"

    const reasoningEffort =
      mode === "fast"
        ? process.env.OPENAI_REASONING_FAST || "low"
        : process.env.OPENAI_REASONING_DEEP || "medium"

    const textVerbosity = process.env.OPENAI_TEXT_VERBOSITY || "low"
    const maxOutputTokens = parseInt(
      process.env.OPENAI_MAX_OUTPUT_TOKENS || "600",
      10
    )

    const requestParams: OpenAI.Responses.ResponseCreateParams = {
      model,
      input: [{ role: "user", content: body.input }],
      instructions: SYSTEM_INSTRUCTIONS,
      max_output_tokens: maxOutputTokens,
      store: true,
    }

    if (body.previous_response_id) {
      requestParams.previous_response_id = body.previous_response_id
    }

    // Only include reasoning.effort for models that support it:
    // - o1, o3 series (reasoning models)
    // - gpt-5 series (gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-medium, gpt-5-pro, gpt-5.1, etc.)
    // NOT supported by: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo, etc.
    const supportsReasoning = /^(o[13](-|$)|gpt-5)/.test(model)
    if (supportsReasoning && reasoningEffort && reasoningEffort !== "none") {
      requestParams.reasoning = {
        effort: reasoningEffort as "low" | "medium" | "high",
      }
    }

    if (textVerbosity) {
      requestParams.text = {
        format: {
          type: "text",
        },
      }
    }

    const response = await openai.responses.create(requestParams)

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
      id: response.id,
      output_text: outputText,
    })
  } catch (error) {
    console.error("API error:", error)

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
