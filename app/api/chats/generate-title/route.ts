import { NextRequest, NextResponse } from "next/server"
import { createTextResponse, extractTextOutput, getConfigInfo } from "@/lib/openai"

export const runtime = "nodejs"

const TITLE_PROMPT = `Generate a short, descriptive chat title (4-8 words) for this conversation. Output ONLY the title text, nothing else. No quotes, no prefix, no punctuation at the end.`

interface GenerateTitleRequest {
  userMessage: string
  assistantMessage: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateTitleRequest

    if (!body.userMessage || !body.assistantMessage) {
      return NextResponse.json(
        { error: "Missing userMessage or assistantMessage" },
        { status: 400 }
      )
    }

    const transcript = `User: ${body.userMessage}\nAssistant: ${body.assistantMessage}`
    const prompt = `${TITLE_PROMPT}\n\n${transcript}`

    // Use the lightweight summarize model (gpt-5-nano) — fast and cheap
    const config = getConfigInfo("summarize")
    if (process.env.NODE_ENV === "development") {
      console.log(`[GenerateTitle] Using model: ${config.model}`)
    }

    const response = await createTextResponse({
      kind: "summarize",
      input: [{ role: "user", content: prompt }],
      instructions: "You are a chat title generator. Output only the title, nothing else.",
      storeOverride: false,
    })

    const title = extractTextOutput(response).trim().replace(/^["']|["']$/g, "")

    return NextResponse.json({ title })
  } catch (error) {
    console.error("[GenerateTitle] Error:", error)
    // Non-critical — return a fallback
    return NextResponse.json({ title: null }, { status: 200 })
  }
}
