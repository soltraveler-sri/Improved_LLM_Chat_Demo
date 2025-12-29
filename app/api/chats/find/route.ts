import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { z } from "zod"
import { zodTextFormat } from "openai/helpers/zod"
import { getChatStore } from "@/lib/store"
import type { StoredChatThreadMeta } from "@/lib/store"

// ---------------------------------------------------------------------------
// POST /api/chats/find
// ---------------------------------------------------------------------------
// Finds and ranks candidate chats matching a natural-language query.
// Uses local lexical scoring for candidate generation + LLM rerank.
// ---------------------------------------------------------------------------

// Request schema
const FindRequestSchema = z.object({
  query: z.string().min(1),
  maxCandidates: z.number().min(1).max(60).optional(),
})

// Structured output schema for LLM rerank
const RerankResultSchema = z.object({
  chatId: z.string().describe("The ID of the matching chat"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence score from 0 to 1 that this chat matches the query"),
  why: z.string().describe("A single short sentence explaining why this chat matches"),
})

const RerankOutputSchema = z.object({
  results: z
    .array(RerankResultSchema)
    .describe("Top matching chats, ordered by relevance/confidence"),
})

type RerankOutput = z.infer<typeof RerankOutputSchema>

// Response option type
interface FindOption {
  chatId: string
  title: string
  summary: string
  updatedAt: number
  confidence: number
  why: string
}

interface FindResponse {
  query: string
  options: FindOption[]
}

// Defaults
const DEFAULT_FINDER_MODEL = "gpt-5-mini"
const DEFAULT_MAX_CANDIDATES = 30
const DEFAULT_TOPK = 5
const MAX_CANDIDATES_CAP = 60

// ---------------------------------------------------------------------------
// Lexical scoring for candidate generation
// ---------------------------------------------------------------------------

interface ScoredCandidate {
  chat: StoredChatThreadMeta
  score: number
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1)
}

function computeLexicalScore(
  query: string,
  chat: StoredChatThreadMeta,
  now: number
): number {
  const queryTokens = new Set(tokenize(query))
  if (queryTokens.size === 0) return 0

  const title = chat.title || ""
  const summary = chat.summary || ""

  const titleTokens = tokenize(title)
  const summaryTokens = tokenize(summary)

  // Count matching tokens
  let titleMatches = 0
  let summaryMatches = 0

  for (const token of titleTokens) {
    if (queryTokens.has(token)) titleMatches++
  }
  for (const token of summaryTokens) {
    if (queryTokens.has(token)) summaryMatches++
  }

  // Title matches weighted 3x, summary matches weighted 1x
  const matchScore = titleMatches * 3 + summaryMatches

  // Recency bias: chats updated in last 7 days get a slight boost
  const ageMs = now - chat.updatedAt
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000
  const recencyBoost = ageMs < oneWeekMs ? 0.5 : 0

  return matchScore + recencyBoost
}

function selectTopCandidates(
  chats: StoredChatThreadMeta[],
  query: string,
  maxCandidates: number
): StoredChatThreadMeta[] {
  const now = Date.now()

  const scored: ScoredCandidate[] = chats.map((chat) => ({
    chat,
    score: computeLexicalScore(query, chat, now),
  }))

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score)

  // Take top maxCandidates
  return scored.slice(0, maxCandidates).map((s) => s.chat)
}

// ---------------------------------------------------------------------------
// LLM rerank prompt builder
// ---------------------------------------------------------------------------

function buildRerankPrompt(
  query: string,
  candidates: StoredChatThreadMeta[],
  topK: number
): string {
  const candidateList = candidates
    .map((c, i) => {
      const summary = c.summary || "(no summary available)"
      const date = new Date(c.updatedAt).toISOString().split("T")[0]
      return `${i + 1}. [ID: ${c.id}]
   Title: ${c.title}
   Summary: ${summary}
   Last updated: ${date}`
    })
    .join("\n\n")

  return `You are a chat search assistant. The user is looking for a past chat conversation.

User query: "${query}"

Here are the candidate chats to consider:

${candidateList}

Your task:
1. Analyze which chats best match what the user is looking for
2. Return the top ${topK} most relevant matches (or fewer if there aren't enough good matches)
3. For each match, provide:
   - chatId: the ID from [ID: xxx]
   - confidence: a score from 0 to 1 indicating how well it matches
   - why: a single short sentence explaining why this chat matches

Order results by relevance (best match first).
If none of the candidates seem relevant to the query, return an empty results array.
Be selective—only include chats that genuinely seem to match what the user is looking for.`
}

// ---------------------------------------------------------------------------
// Helper to get demo_uid from cookies
// ---------------------------------------------------------------------------

function getDemoUid(request: NextRequest): string | null {
  return request.cookies.get("demo_uid")?.value ?? null
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const demoUid = getDemoUid(request)
    if (!demoUid) {
      return NextResponse.json(
        { error: "No demo_uid cookie found" },
        { status: 401 }
      )
    }

    const body = await request.json()

    // Validate request
    const parseResult = FindRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      )
    }

    const { query } = parseResult.data

    // Determine maxCandidates and topK from env or request
    const envMaxCandidates = process.env.OPENAI_CHAT_FINDER_MAX_CANDIDATES
    const envTopK = process.env.OPENAI_CHAT_FINDER_TOPK

    const maxCandidates = Math.min(
      parseResult.data.maxCandidates ??
        (envMaxCandidates ? parseInt(envMaxCandidates, 10) : DEFAULT_MAX_CANDIDATES),
      MAX_CANDIDATES_CAP
    )

    const topK = envTopK ? parseInt(envTopK, 10) : DEFAULT_TOPK

    // Check for API key
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      )
    }

    // Step A: Load all chats and generate candidates locally
    const store = getChatStore()
    const allChats = await store.listThreads(demoUid)

    if (allChats.length === 0) {
      const response: FindResponse = { query, options: [] }
      return NextResponse.json(response)
    }

    const candidates = selectTopCandidates(allChats, query, maxCandidates)

    if (candidates.length === 0) {
      const response: FindResponse = { query, options: [] }
      return NextResponse.json(response)
    }

    // Step B: LLM rerank
    const openai = new OpenAI({ apiKey })
    const model = process.env.OPENAI_CHAT_FINDER_MODEL || DEFAULT_FINDER_MODEL

    const prompt = buildRerankPrompt(query, candidates, topK)

    const llmResponse = await openai.responses.parse({
      model,
      input: prompt,
      store: false,
      reasoning: { effort: "none" },
      text: {
        format: zodTextFormat(RerankOutputSchema, "rerank_results"),
      },
    })

    const parsed = llmResponse.output_parsed as RerankOutput | null

    if (!parsed) {
      console.error("[POST /api/chats/find] Failed to parse rerank output")
      return NextResponse.json(
        { error: "Failed to parse reranking results from model response" },
        { status: 500 }
      )
    }

    // Step C: Build response with joined metadata
    // Create a lookup map for candidates
    const candidateMap = new Map<string, StoredChatThreadMeta>()
    for (const c of candidates) {
      candidateMap.set(c.id, c)
    }

    const options: FindOption[] = []

    for (const result of parsed.results) {
      const chat = candidateMap.get(result.chatId)
      if (!chat) {
        // Skip if chatId doesn't match any candidate (model hallucination)
        console.warn(
          `[POST /api/chats/find] LLM returned unknown chatId: ${result.chatId}`
        )
        continue
      }

      options.push({
        chatId: chat.id,
        title: chat.title,
        summary: chat.summary || "",
        updatedAt: chat.updatedAt,
        confidence: result.confidence,
        why: result.why,
      })
    }

    // Sort by confidence desc (should already be, but ensure)
    options.sort((a, b) => b.confidence - a.confidence)

    const response: FindResponse = { query, options }
    return NextResponse.json(response)
  } catch (error) {
    console.error("[POST /api/chats/find] Error:", error)

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
