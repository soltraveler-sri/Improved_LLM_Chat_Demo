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

    // Check if model supports reasoning
    const supportsReasoning = /^(o[13](-|$)|gpt-5)/.test(model)
    
    // Use text.verbosity to guide response length (not max_output_tokens which causes hard cutoffs)
    // Default to "low" for concise responses that complete naturally without truncation
    const textVerbosity = process.env.OPENAI_TEXT_VERBOSITY || "low"
    
    // max_output_tokens is only used as a safety limit to prevent runaway costs
    // Set very high so it doesn't interfere with natural response completion
    // If not set, don't include it at all (let model use its default)
    const maxOutputTokens = process.env.OPENAI_MAX_OUTPUT_TOKENS 
      ? parseInt(process.env.OPENAI_MAX_OUTPUT_TOKENS, 10)
      : null

    const requestParams: OpenAI.Responses.ResponseCreateParams = {
      model,
      input: [{ role: "user", content: body.input }],
      instructions: SYSTEM_INSTRUCTIONS,
      store: true,
    }
    
    // Only set max_output_tokens if explicitly configured (as a cost safety limit)
    // Otherwise, let the model complete naturally guided by verbosity and instructions
    if (maxOutputTokens) {
      requestParams.max_output_tokens = maxOutputTokens
    }

    if (body.previous_response_id) {
      requestParams.previous_response_id = body.previous_response_id
    }

    // Only include reasoning.effort for models that support it:
    // - o1, o3 series (reasoning models)
    // - gpt-5 series (gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-medium, gpt-5-pro, gpt-5.1, etc.)
    // NOT supported by: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo, etc.
    if (supportsReasoning && reasoningEffort && reasoningEffort !== "none") {
      requestParams.reasoning = {
        effort: reasoningEffort as "low" | "medium" | "high",
      }
    }

    // Configure text output verbosity to guide response length naturally
    // This is the primary mechanism for controlling response length without hard cutoffs
    // "low" = concise responses, "medium" = balanced, "high" = detailed
    if (["low", "medium", "high"].includes(textVerbosity)) {
      requestParams.text = {
        format: { type: "text" },
        verbosity: textVerbosity as "low" | "medium" | "high",
      }
    }

    // Debug: Log request params
    console.log("OpenAI Request:", {
      model: requestParams.model,
      reasoningEffort: requestParams.reasoning?.effort || "none",
      textVerbosity: requestParams.text?.verbosity || "default",
      maxOutputTokens: requestParams.max_output_tokens || "unlimited",
      hasPreviousResponseId: !!requestParams.previous_response_id,
    })

    const response = await openai.responses.create(requestParams)

    // Debug: Log response structure to help diagnose empty responses
    console.log("OpenAI Response:", {
      id: response.id,
      status: response.status,
      output_text: response.output_text,
      output_count: response.output?.length,
      output_types: response.output?.map((item) => item.type),
      model: response.model,
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

    // Debug: Log if output is empty or incomplete
    if (!outputText) {
      console.warn("Empty output_text. Full response output:", JSON.stringify(response.output, null, 2))
    }
    
    if (response.status === "incomplete") {
      console.warn("Response incomplete:", {
        reason: response.incomplete_details,
        suggestion: "If due to max_output_tokens, increase OPENAI_MAX_OUTPUT_TOKENS or remove it entirely",
      })
    }

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
