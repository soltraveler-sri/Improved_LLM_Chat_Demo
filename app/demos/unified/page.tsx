"use client"

import { useState, useRef, useEffect, useCallback, useMemo, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  RotateCcw,
  Loader2,
  Send,
  Search,
  Sparkles,
  Zap,
  Plus,
  MessageSquare,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  ChatMessageBubble,
  TypingIndicator,
  BranchOverlay,
} from "@/components/chat"
import type { BranchCloseResult } from "@/components/chat"
import { TaskCard } from "@/components/codex"
import { FinderOptionCard, type FinderOption } from "@/components/history"
import { StorageWarningBanner } from "@/components/ui/storage-warning-banner"
import type {
  ChatMessage,
  MainThreadState,
  RespondResponse,
  BranchThread,
  SummarizeResponse,
} from "@/lib/types"
import type { CodexTask, WorkspaceSnapshot } from "@/lib/codex/types"
import type { StoredChatThread, StoredChatThreadMeta } from "@/lib/store/types"
import { ScrollArea } from "@/components/ui/scroll-area"

// =============================================================================
// HELPERS
// =============================================================================

function generateId(): string {
  return crypto.randomUUID()
}

/**
 * Check if a message is a @codex command
 */
function isCodexCommand(text: string): boolean {
  return text.trim().toLowerCase().startsWith("@codex ")
}

/**
 * Extract the prompt from a @codex command
 */
function extractCodexPrompt(text: string): string {
  return text.trim().slice(7).trim() // Remove "@codex "
}

/**
 * Check if message is a find command
 */
function isFindCommand(text: string): boolean {
  return text.trim().toLowerCase().startsWith("/find ")
}

/**
 * Extract query from /find command
 */
function extractFindQuery(text: string): string {
  return text.trim().slice(6).trim()
}

/**
 * Build a compact context string from a task's context summary
 * Used for ingesting task output into the chat chain
 */
function buildTaskContextInput(task: CodexTask): string | null {
  const summary = task.contextSummary
  if (!summary) return null

  const lines: string[] = [
    `Context from completed Codex task "${summary.title}":`,
    "",
    `Files generated: ${summary.filePaths.slice(0, 5).join(", ")}${summary.filePaths.length > 5 ? "..." : ""}`,
  ]

  if (summary.languages.length > 0) {
    lines.push(`Languages: ${summary.languages.join(", ")}`)
  }

  if (summary.bullets.length > 0) {
    lines.push("")
    lines.push("Summary of what was built:")
    for (const bullet of summary.bullets.slice(0, 4)) {
      lines.push(`- ${bullet}`)
    }
  }

  return lines.join("\n")
}

// =============================================================================
// Extended Chat Message Type (with task support)
// =============================================================================

interface UnifiedMessage extends ChatMessage {
  /** Optional task ID if this is a task card message */
  taskId?: string
  /** Whether this is a task card (renders TaskCard instead of bubble) */
  isTaskCard?: boolean
}

// =============================================================================
// PERSISTENCE HELPERS (fire-and-forget, best-effort)
// =============================================================================

async function createStoredThread(title?: string): Promise<string | null> {
  try {
    const res = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || "New Chat", category: "recent" }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.thread?.id ?? null
  } catch {
    return null
  }
}

function persistMessage(
  threadId: string,
  message: { id: string; role: string; text: string; createdAt: number; responseId?: string }
): void {
  fetch(`/api/chats/${threadId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  }).catch(() => {})
}

function updateStoredThread(
  threadId: string,
  updates: { title?: string; lastResponseId?: string | null }
): void {
  fetch(`/api/chats/${threadId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  }).catch(() => {})
}

// =============================================================================
// FIND TYPES
// =============================================================================

interface FindResponse {
  query: string
  options: Array<{
    chatId: string
    title: string
    summary: string
    updatedAt: number
    confidence: number
    why: string
  }>
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

function UnifiedDemoContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // URL-based chat ID (for loading a past chat)
  const urlChatId = searchParams.get("chatId")

  // ==========================================================================
  // CORE STATE: Chain Controller
  // ==========================================================================
  const [state, setState] = useState<MainThreadState>({
    messages: [],
    lastResponseId: null,
  })
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isMerging, setIsMerging] = useState(false)

  // Ref for async operations to get current chain ID
  const lastResponseIdRef = useRef<string | null>(null)
  const chainQueueRef = useRef<Promise<void>>(Promise.resolve())
  const enqueueChain = useCallback(<T,>(operation: () => Promise<T>) => {
    const queued = chainQueueRef.current.then(operation, operation)
    chainQueueRef.current = queued.then(
      () => undefined,
      () => undefined
    )
    return queued
  }, [])

  // ==========================================================================
  // BRANCH STATE
  // ==========================================================================
  const [branchesByParentLocalId, setBranchesByParentLocalId] = useState<
    Record<string, BranchThread[]>
  >({})
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null)

  // ==========================================================================
  // CODEX STATE
  // ==========================================================================
  const [tasks, setTasks] = useState<Record<string, CodexTask>>({})
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null)
  const ingestedTaskIdsRef = useRef<Set<string>>(new Set())
  const isIngestingRef = useRef(false)
  // Store pending branch context to prepend to next user message (avoids slow LLM call)
  const pendingBranchContextRef = useRef<{
    contextInput: string
    branchId: string
    branchTitle: string
    mergeType: "summary" | "full"
  } | null>(null)

  // ==========================================================================
  // FIND STATE
  // ==========================================================================
  const [finderPending, setFinderPending] = useState(false)
  const [finderOptions, setFinderOptions] = useState<FinderOption[]>([])
  const [openingChatId, setOpeningChatId] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  // ==========================================================================
  // PERSISTENCE STATE
  // ==========================================================================
  const storedThreadIdRef = useRef<string | null>(null)

  // ==========================================================================
  // SIDEBAR STATE
  // ==========================================================================
  const [threads, setThreads] = useState<StoredChatThreadMeta[]>([])
  const [isLoadingThreads, setIsLoadingThreads] = useState(true)

  // ==========================================================================
  // CHAIN RECOVERY + OBSERVABILITY
  // ==========================================================================
  const resetChain = useCallback(() => {
    lastResponseIdRef.current = null
    setState((prev) => ({
      ...prev,
      lastResponseId: null,
    }))
    if (storedThreadIdRef.current) {
      updateStoredThread(storedThreadIdRef.current, {
        lastResponseId: null,
      })
    }
  }, [])

  // Fetch threads for sidebar
  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/chats")
      if (res.ok) {
        const data = await res.json()
        setThreads(data.threads || [])
      }
    } catch (error) {
      console.error("Failed to fetch threads:", error)
    } finally {
      setIsLoadingThreads(false)
    }
  }, [])

  const logRespondCall = useCallback(
    (params: {
      source: "ingestion" | "user"
      previousResponseId: string | null
      newResponseId: string | null
      status: number
      didRetry: boolean
    }) => {
      if (process.env.NODE_ENV !== "development") return
      const prevPreview = params.previousResponseId
        ? params.previousResponseId.slice(0, 8)
        : "none"
      const nextPreview = params.newResponseId
        ? params.newResponseId.slice(0, 8)
        : "none"
      const retryLabel = params.didRetry ? " retry" : ""
      console.log(
        `[Respond][Unified][${params.source}] prev=${prevPreview} new=${nextPreview} status=${params.status}${retryLabel}`
      )
    },
    []
  )

  const isChainBrokenResponse = useCallback(
    (status: number, payload?: { code?: string; message?: string; error?: string }) => {
      if (status === 409 && payload?.code === "chain_broken") return true
      const message = `${payload?.message ?? ""} ${payload?.error ?? ""}`.toLowerCase()
      return message.includes("previous_response_not_found")
    },
    []
  )

  const respondWithRetry = useCallback(
    async ({
      input,
      mode,
      source,
    }: {
      input: string
      mode: "fast" | "deep"
      source: "ingestion" | "user"
    }): Promise<RespondResponse> => {
      const attempt = async (
        previousResponseId: string | null,
        didRetry: boolean
      ): Promise<RespondResponse> => {
        const body: {
          input: string
          mode: "fast" | "deep"
          previous_response_id?: string | null
        } = { input, mode }
        if (previousResponseId) {
          body.previous_response_id = previousResponseId
        }

        const res = await fetch("/api/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })

        let data: RespondResponse | { code?: string; message?: string; error?: string }
        try {
          data = await res.json()
        } catch {
          data = {}
        }

        logRespondCall({
          source,
          previousResponseId,
          newResponseId: res.ok ? (data as RespondResponse).id : null,
          status: res.status,
          didRetry,
        })

        if (res.ok) {
          return data as RespondResponse
        }

        const payload = data as { code?: string; message?: string; error?: string }
        if (isChainBrokenResponse(res.status, payload)) {
          resetChain()
          if (!didRetry) {
            const retryResult = await attempt(null, true)
            toast.info("Chain reset; continuing")
            return retryResult
          }
          toast.error("Chain reset; please retry")
          throw new Error("CHAIN_RESET_RETRY_FAILED")
        }

        throw new Error(payload.error || payload.message || "Failed to get response")
      }

      return attempt(lastResponseIdRef.current, false)
    },
    [isChainBrokenResponse, logRespondCall, resetChain]
  )

  // ==========================================================================
  // UI REFS
  // ==========================================================================
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const shouldAutoScroll = useRef(true)

  // ==========================================================================
  // COMPUTED VALUES
  // ==========================================================================

  // Get the active branch object
  const activeBranch = useMemo(() => {
    if (!activeBranchId) return null
    for (const branches of Object.values(branchesByParentLocalId)) {
      const branch = branches.find((b) => b.id === activeBranchId)
      if (branch) return branch
    }
    return null
  }, [activeBranchId, branchesByParentLocalId])

  // Get parent message text for the active branch
  const parentMessageText = useMemo(() => {
    if (!activeBranch) return ""
    const parentMessage = state.messages.find(
      (m) => m.localId === activeBranch.parentAssistantLocalId
    )
    return parentMessage?.text || ""
  }, [activeBranch, state.messages])

  // Cast messages to UnifiedMessage for type safety
  const messages = state.messages as UnifiedMessage[]

  // ==========================================================================
  // EFFECTS
  // ==========================================================================

  // Track scroll position
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const { scrollTop, scrollHeight, clientHeight } = container
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
    shouldAutoScroll.current = distanceFromBottom < 100
  }, [])

  // Autoscroll to bottom
  useEffect(() => {
    if (shouldAutoScroll.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [state.messages, isLoading, finderOptions])

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = "auto"
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [inputValue])

  // Fetch workspace on mount
  useEffect(() => {
    async function fetchWorkspace() {
      try {
        const res = await fetch("/api/codex/workspace")
        if (res.ok) {
          const data = await res.json()
          setWorkspace(data.workspace)
        }
      } catch (error) {
        console.error("Failed to fetch workspace:", error)
      }
    }
    fetchWorkspace()
  }, [])

  // Fetch threads for sidebar on mount
  useEffect(() => {
    fetchThreads()
  }, [fetchThreads])

  // Load chat from URL if chatId is present
  useEffect(() => {
    async function loadChat() {
      if (!urlChatId) return

      try {
        const res = await fetch(`/api/chats/${urlChatId}`)
        if (!res.ok) {
          toast.error("Failed to load chat")
          return
        }

        const data = await res.json()
        const thread = data.thread as StoredChatThread

        if (thread) {
          // Convert stored messages to ChatMessage format
          const loadedMessages: UnifiedMessage[] = thread.messages.map((m) => ({
            localId: m.id,
            role: m.role as "user" | "assistant" | "context",
            text: m.text,
            createdAt: m.createdAt,
            responseId: m.responseId,
          }))

          setState({
            messages: loadedMessages,
            lastResponseId: thread.lastResponseId || null,
          })
          lastResponseIdRef.current = thread.lastResponseId || null

          storedThreadIdRef.current = thread.id

          // Clear finder state
          setFinderOptions([])
        }
      } catch (error) {
        console.error("Failed to load chat:", error)
        toast.error("Failed to load chat")
      }
    }

    loadChat()
  }, [urlChatId])

  // ==========================================================================
  // CODEX TASK INGESTION (Chain Controller Pattern)
  // ==========================================================================

  // Ingest a completed task's context into the chat chain
  const ingestTaskContext = useCallback(
    (task: CodexTask) => {
      const contextInput = buildTaskContextInput(task)
      if (!contextInput) return Promise.resolve()

      return enqueueChain(async () => {
        try {
          const currentResponseId = lastResponseIdRef.current

          const res = await fetch("/api/respond", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              input: contextInput,
              previous_response_id: currentResponseId,
              mode: "deep",
            }),
          })

          const data = await res.json()

          if (!res.ok) {
            console.error("Failed to ingest task context:", data.error)
            return
          }

          // Update both ref (immediately) and state
          lastResponseIdRef.current = data.id
          setState((prev) => ({
            ...prev,
            lastResponseId: data.id,
          }))

          if (storedThreadIdRef.current) {
            updateStoredThread(storedThreadIdRef.current, {
              lastResponseId: data.id,
            })
          }

          if (process.env.NODE_ENV === "development") {
            console.log(
              `[Unified:ingest] Task "${task.id.slice(0, 8)}..." ingested into chain`
            )
          }
        } catch (error) {
          console.error("Failed to ingest task context:", error)
        }
      })
    },
    [enqueueChain]
  )

  // Watch for completed tasks and ingest them
  useEffect(() => {
    async function ingestCompletedTasks() {
      if (isIngestingRef.current) return

      const completedTasks = Object.values(tasks)
        .filter(
          (t) =>
            t.contextSummary &&
            (t.status === "draft_ready" ||
              t.status === "applied" ||
              t.status === "pr_created") &&
            !ingestedTaskIdsRef.current.has(t.id)
        )
        .sort((a, b) => a.updatedAt - b.updatedAt)

      if (completedTasks.length === 0) return

      isIngestingRef.current = true

      try {
        for (const task of completedTasks) {
          ingestedTaskIdsRef.current.add(task.id)
          await ingestTaskContext(task)
        }
      } finally {
        isIngestingRef.current = false
      }
    }

    ingestCompletedTasks()
  }, [tasks, ingestTaskContext])

  // ==========================================================================
  // BRANCH MERGE (from Demo 1)
  // ==========================================================================

  // Threshold for skipping LLM summarization - short chats get embedded directly
  const SKIP_SUMMARIZATION_THRESHOLD = 10

  /**
   * Format branch messages as bullet points (looks like a summary but is the full content)
   * Used for short conversations where LLM summarization would be slower than helpful
   */
  const formatAsQuickSummary = (messages: BranchThread["messages"]): string => {
    // For very short conversations, just use a compact format
    const lines: string[] = []
    for (const m of messages) {
      const prefix = m.role === "user" ? "User asked:" : "Assistant:"
      // Truncate long messages for the visual "summary"
      const text = m.text.length > 150 ? m.text.slice(0, 147) + "..." : m.text
      lines.push(`• ${prefix} ${text}`)
    }
    return lines.join("\n")
  }

  /**
   * Perform branch merge - NO LLM call, just formats context for next message
   * The context will be prepended to the user's next message automatically
   */
  const performMerge = async (
    branch: BranchThread,
    mergeMode: "summary" | "full"
  ): Promise<{ contextText: string; contextInput: string } | null> => {
    try {
      let contextInput: string
      let displayText: string

      if (mergeMode === "summary") {
        // For short conversations, skip LLM and embed full content directly
        if (branch.messages.length <= SKIP_SUMMARIZATION_THRESHOLD) {
          const quickSummary = formatAsQuickSummary(branch.messages)
          contextInput = `Context from branch "${branch.title}":\n${quickSummary}`
          displayText = quickSummary
        } else {
          // Longer conversations: use LLM summarization (only this part uses API)
          const summarizeRes = await fetch("/api/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              branchMessages: branch.messages.map((m) => ({
                role: m.role as "user" | "assistant",
                text: m.text,
              })),
            }),
          })

          const summarizeData = await summarizeRes.json()

          if (!summarizeRes.ok) {
            throw new Error(summarizeData.error || "Failed to summarize")
          }

          const summary = (summarizeData as SummarizeResponse).summary
          contextInput = `Context from branch "${branch.title}":\n${summary}`
          displayText = summary
        }
      } else {
        const transcript = branch.messages
          .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
          .join("\n\n")
        contextInput = `Context from branch "${branch.title}" (full):\n${transcript}`
        displayText = `Full transcript from "${branch.title}"`
      }

      // Store context for next message instead of calling LLM now
      pendingBranchContextRef.current = {
        contextInput,
        branchId: branch.id,
        branchTitle: branch.title,
        mergeType: mergeMode,
      }

      return {
        contextText: displayText,
        contextInput,
      }
    } catch (error) {
      console.error("Merge error:", error)
      throw error
    }
  }

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  // Handle sending a message
  const handleSend = async () => {
    const userText = inputValue.trim()
    if (!userText || isLoading || isMerging) return

    setInputValue("")
    shouldAutoScroll.current = true

    // Clear finder results when sending a new message
    setFinderOptions([])

    // Check for /find command
    if (isFindCommand(userText)) {
      const query = extractFindQuery(userText)
      if (!query) {
        toast.error("Please provide a search query after /find")
        return
      }
      await handleFindChat(query)
      return
    }

    // Check for @codex command
    if (isCodexCommand(userText)) {
      await handleCodexCommand(userText)
      return
    }

    // Regular chat message
    await handleRegularChat(userText)
  }

  // Handle /find command
  const handleFindChat = async (query: string) => {
    setFinderPending(true)
    const currentRequestId = ++requestIdRef.current

    try {
      const res = await fetch("/api/chats/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      })

      if (requestIdRef.current !== currentRequestId) return

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to find chats")
      }

      const data: FindResponse = await res.json()

      const options: FinderOption[] = data.options.map((opt) => ({
        chatId: opt.chatId,
        title: opt.title,
        summary: opt.summary,
        updatedAt: opt.updatedAt,
        confidence: opt.confidence,
        why: opt.why,
      }))

      setFinderOptions(options)

      if (options.length === 0) {
        toast.info("No matching chats found")
      }
    } catch (error) {
      if (requestIdRef.current === currentRequestId) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to search"
        toast.error(errorMessage)
      }
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setFinderPending(false)
      }
    }
  }

  // Handle opening a found chat (navigate to it)
  const handleOpenFoundChat = async (chatId: string) => {
    setOpeningChatId(chatId)

    try {
      // Save current chat state before navigating (if there are messages)
      if (state.messages.length > 0 && storedThreadIdRef.current) {
        updateStoredThread(storedThreadIdRef.current, {
          lastResponseId: lastResponseIdRef.current,
        })
      }

      // Navigate to the selected chat
      router.push(`/demos/unified?chatId=${chatId}`)
    } catch (error) {
      console.error("Failed to navigate to chat:", error)
      toast.error("Failed to open chat")
    } finally {
      setOpeningChatId(null)
    }
  }

  // Handle @codex command
  const handleCodexCommand = async (text: string) => {
    const prompt = extractCodexPrompt(text)

    // Create user message
    const userMessage: UnifiedMessage = {
      localId: generateId(),
      role: "user",
      text,
      createdAt: Date.now(),
    }

    // Create placeholder task immediately
    const placeholderId = `placeholder_${generateId()}`
    const placeholderTask: CodexTask = {
      id: placeholderId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      prompt,
      title: "",
      status: "queued",
      planMarkdown: "",
      changes: [],
      logs: [],
      diffUnified: "",
    }

    // Create task card message
    const taskMessage: UnifiedMessage = {
      localId: generateId(),
      role: "assistant",
      text: "",
      createdAt: Date.now(),
      taskId: placeholderId,
      isTaskCard: true,
    }

    // Update state immediately for instant feedback
    setTasks((prev) => ({ ...prev, [placeholderId]: placeholderTask }))
    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, userMessage, taskMessage],
    }))
    setIsLoading(true)

    // Persist user message — await thread creation so messages are never lost
    if (!storedThreadIdRef.current) {
      const id = await createStoredThread(`@codex: ${prompt.slice(0, 30)}...`)
      if (id) {
        storedThreadIdRef.current = id
        persistMessage(id, {
          id: userMessage.localId,
          role: userMessage.role,
          text: userMessage.text,
          createdAt: userMessage.createdAt,
        })
        fetchThreads()
      }
    } else {
      persistMessage(storedThreadIdRef.current, {
        id: userMessage.localId,
        role: userMessage.role,
        text: userMessage.text,
        createdAt: userMessage.createdAt,
      })
    }

    try {
      const res = await fetch("/api/codex/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      })

      const data = await res.json()

      if (!res.ok) {
        // Update placeholder with error
        setTasks((prev) => ({
          ...prev,
          [placeholderId]: {
            ...placeholderTask,
            status: "failed",
            error: data.error || "Failed to create task",
            logs: ["Error: " + (data.error || "Failed to create task")],
          },
        }))
        throw new Error(data.error || "Failed to create task")
      }

      const task = data.task as CodexTask

      if (process.env.NODE_ENV === "development") {
        console.log(
          `[Unified:handleCodexCommand] Replacing placeholder task "${placeholderId}" with real task "${task.id}"`
        )
      }

      // Replace placeholder with real task
      setTasks((prev) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [placeholderId]: _removed, ...rest } = prev
        return { ...rest, [task.id]: task }
      })

      // Update message to reference real task ID
      setState((prev) => ({
        ...prev,
        messages: prev.messages.map((msg) => {
          const unifiedMsg = msg as UnifiedMessage
          return unifiedMsg.taskId === placeholderId
            ? { ...unifiedMsg, taskId: task.id }
            : msg
        }),
      }))

      // Track which task to use for ingestion (either the returned task or the refreshed one)
      let taskForIngestion: CodexTask = task

      // Poll for completion if still running
      if (task.status === "running" || task.status === "queued") {
        const refreshedTask = await refreshTask(task.id)
        if (refreshedTask) {
          taskForIngestion = refreshedTask
        }
      }

      // Re-enable input immediately so user doesn't see "..." after task completes
      setIsLoading(false)

      // Start ingestion in background (serialized via chain queue)
      if (
        taskForIngestion.contextSummary &&
        !ingestedTaskIdsRef.current.has(taskForIngestion.id)
      ) {
        ingestedTaskIdsRef.current.add(taskForIngestion.id)
        ingestTaskContext(taskForIngestion)

        if (process.env.NODE_ENV === "development") {
          console.log(
            `[Unified:handleCodexCommand] Task "${taskForIngestion.id.slice(0, 8)}..." context ingestion started (background)`
          )
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Something went wrong"
      toast.error(errorMessage)
      setIsLoading(false)
    }
  }

  // Handle regular chat message
  const handleRegularChat = async (userText: string) => {
    // Check for pending branch context to prepend
    const pendingContext = pendingBranchContextRef.current
    let actualInput = userText
    if (pendingContext) {
      // Prepend the context to the user's message for the LLM
      actualInput = `${pendingContext.contextInput}\n\n---\n\nUser message: ${userText}`
      // Clear the pending context
      pendingBranchContextRef.current = null
    }

    const userMessage: UnifiedMessage = {
      localId: generateId(),
      role: "user",
      text: userText, // Show original text to user
      createdAt: Date.now(),
    }

    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, userMessage],
    }))
    setIsLoading(true)

    // Persistence — await thread creation so messages are never lost
    if (!storedThreadIdRef.current) {
      const threadTitle = userText.length > 50 ? userText.slice(0, 50) + "..." : userText
      const id = await createStoredThread(threadTitle)
      if (id) {
        storedThreadIdRef.current = id
        persistMessage(id, {
          id: userMessage.localId,
          role: userMessage.role,
          text: userMessage.text,
          createdAt: userMessage.createdAt,
        })
        fetchThreads()
      }
    } else {
      persistMessage(storedThreadIdRef.current, {
        id: userMessage.localId,
        role: userMessage.role,
        text: userMessage.text,
        createdAt: userMessage.createdAt,
      })
    }

    try {
      await enqueueChain(async () => {
        // Send with prepended context if any
        const res = await fetch("/api/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: actualInput,
            previous_response_id: lastResponseIdRef.current,
            mode: "deep",
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || "Failed to get response")
        }

        const responseData = data as RespondResponse

        const assistantMessage: UnifiedMessage = {
          localId: generateId(),
          role: "assistant",
          text: responseData.output_text,
          createdAt: Date.now(),
          responseId: responseData.id,
        }

        lastResponseIdRef.current = responseData.id
        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, assistantMessage],
          lastResponseId: responseData.id,
        }))

        // Persist assistant message
        if (storedThreadIdRef.current) {
          persistMessage(storedThreadIdRef.current, {
            id: assistantMessage.localId,
            role: assistantMessage.role,
            text: assistantMessage.text,
            createdAt: assistantMessage.createdAt,
            responseId: assistantMessage.responseId,
          })
          updateStoredThread(storedThreadIdRef.current, {
            lastResponseId: responseData.id,
          })
        }
      })
    } catch (error) {
      if (error instanceof Error && error.message === "CHAIN_RESET_RETRY_FAILED") {
        return
      }
      const errorMessage =
        error instanceof Error ? error.message : "Something went wrong"
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  // Handle creating a branch
  const handleBranch = (localId: string, responseId: string) => {
    const existingBranches = branchesByParentLocalId[localId] || []
    const branchNumber = existingBranches.length + 1

    const newBranch: BranchThread = {
      id: generateId(),
      parentAssistantLocalId: localId,
      parentAssistantResponseId: responseId,
      title: `Branch ${branchNumber}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mode: "fast",
      includeInMain: false,
      includeMode: "summary",
      messages: [],
      lastResponseId: null,
      mergedIntoMain: false,
    }

    setBranchesByParentLocalId((prev) => ({
      ...prev,
      [localId]: [...(prev[localId] || []), newBranch],
    }))

    setActiveBranchId(newBranch.id)
  }

  // Handle opening an existing branch
  const handleOpenBranch = (branchId: string) => {
    setActiveBranchId(branchId)
  }

  // Handle closing branch overlay
  const handleCloseBranch = async (result?: BranchCloseResult) => {
    if (!result) {
      setActiveBranchId(null)
      return
    }

    const { branch, shouldMerge, mergeMode } = result

    if (!shouldMerge) {
      setActiveBranchId(null)
      return
    }

    // Perform the merge
    setIsMerging(true)
    shouldAutoScroll.current = true

    try {
      const mergeResult = await performMerge(branch, mergeMode || "summary")

      if (mergeResult) {
        const contextMessage: UnifiedMessage = {
          localId: generateId(),
          role: "context",
          text: mergeResult.contextText,
          createdAt: Date.now(),
          contextMeta: {
            branchId: branch.id,
            branchTitle: branch.title,
            mergeType: mergeMode || "summary",
          },
        }

        // Add context message to UI immediately (no LLM call needed)
        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, contextMessage],
        }))

        // Persist context message
        if (storedThreadIdRef.current) {
          persistMessage(storedThreadIdRef.current, {
            id: contextMessage.localId,
            role: contextMessage.role,
            text: contextMessage.text,
            createdAt: contextMessage.createdAt,
          })
        }

        // Mark branch as merged
        const updatedBranch: BranchThread = {
          ...branch,
          mergedIntoMain: true,
          mergedAs: mergeMode || "summary",
          mergedAt: Date.now(),
          updatedAt: Date.now(),
        }

        setBranchesByParentLocalId((prev) => {
          const parentId = branch.parentAssistantLocalId
          const branches = prev[parentId] || []
          const updatedBranches = branches.map((b) =>
            b.id === branch.id ? updatedBranch : b
          )
          return {
            ...prev,
            [parentId]: updatedBranches,
          }
        })

        toast.success(
          "Branch context added",
          {
            description: `Context from "${branch.title}" will be included in your next message.`,
          }
        )
      }
    } catch (error) {
      // Revert includeInMain toggle on failure
      const revertedBranch: BranchThread = {
        ...branch,
        includeInMain: false,
        updatedAt: Date.now(),
      }

      setBranchesByParentLocalId((prev) => {
        const parentId = branch.parentAssistantLocalId
        const branches = prev[parentId] || []
        const updatedBranches = branches.map((b) =>
          b.id === branch.id ? revertedBranch : b
        )
        return {
          ...prev,
          [parentId]: updatedBranches,
        }
      })

      const isTimeout =
        error instanceof Error && error.message.includes("timed out")
      toast.error("Summarization failed", {
        description: isTimeout
          ? "The request took too long. You can retry by toggling again."
          : error instanceof Error
            ? error.message
            : "Failed to merge branch. You can retry by toggling again.",
      })
    } finally {
      setIsMerging(false)
      setActiveBranchId(null)
    }
  }

  // Handle updating a branch
  const handleUpdateBranch = (updatedBranch: BranchThread) => {
    setBranchesByParentLocalId((prev) => {
      const parentId = updatedBranch.parentAssistantLocalId
      const branches = prev[parentId] || []
      const updatedBranches = branches.map((b) =>
        b.id === updatedBranch.id ? updatedBranch : b
      )
      return {
        ...prev,
        [parentId]: updatedBranches,
      }
    })
  }

  // Codex task helpers
  // Returns the refreshed task so callers can use it for synchronous ingestion
  const refreshTask = async (taskId: string): Promise<CodexTask | null> => {
    try {
      if (taskId.startsWith("placeholder_")) {
        return null
      }
      const res = await fetch(`/api/codex/tasks/${taskId}`)
      if (res.ok) {
        const data = await res.json()
        const refreshedTask = data.task as CodexTask
        setTasks((prev) => ({ ...prev, [taskId]: refreshedTask }))
        return refreshedTask
      }
      return null
    } catch (error) {
      console.error("Failed to refresh task:", error)
      return null
    }
  }

  const applyTaskChanges = async (taskId: string) => {
    const res = await fetch(`/api/codex/tasks/${taskId}/apply`, {
      method: "POST",
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || "Failed to apply changes")
    }
    const data = await res.json()
    setTasks((prev) => ({ ...prev, [taskId]: data.task }))
    setWorkspace(data.workspace)
  }

  const createTaskPR = async (taskId: string) => {
    const res = await fetch(`/api/codex/tasks/${taskId}/pr`, {
      method: "POST",
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || "Failed to create PR")
    }
    const data = await res.json()
    setTasks((prev) => ({ ...prev, [taskId]: data.task }))
  }

  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (inputValue.trim() && !isLoading && !isMerging) {
        handleSend()
      }
    }
  }

  // Reset chat state
  const handleReset = useCallback(() => {
    // If we were viewing a specific chat, navigate back to clean URL
    if (urlChatId) {
      router.push("/demos/unified")
    }

    setState({
      messages: [],
      lastResponseId: null,
    })
    setBranchesByParentLocalId({})
    setActiveBranchId(null)
    setTasks({})
    setFinderOptions([])
    setInputValue("")
    storedThreadIdRef.current = null
    ingestedTaskIdsRef.current.clear()
    lastResponseIdRef.current = null
    pendingBranchContextRef.current = null
    chainQueueRef.current = Promise.resolve()

    // Refresh sidebar so past chats remain visible
    fetchThreads()
  }, [urlChatId, router, fetchThreads])

  const hasMessages = state.messages.length > 0
  const hasFinderResults = finderOptions.length > 0

  // Format relative time for sidebar
  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return "Just now"
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return new Date(timestamp).toLocaleDateString()
  }

  // Handle clicking a thread in sidebar
  const handleSelectThread = (threadId: string) => {
    if (threadId === storedThreadIdRef.current) return
    router.push(`/demos/unified?chatId=${threadId}`)
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full">
        {/* Left Sidebar */}
        <div className="w-64 border-r border-border flex flex-col bg-muted/30">
          <div className="p-3 border-b border-border">
            <Button
              onClick={handleReset}
              className="w-full gap-2"
              variant="outline"
            >
              <Plus className="h-4 w-4" />
              New Chat
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {isLoadingThreads ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : threads.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No chats yet
                </div>
              ) : (
                threads.map((thread) => {
                  const isActive = thread.id === storedThreadIdRef.current || thread.id === urlChatId
                  return (
                    <button
                      key={thread.id}
                      onClick={() => handleSelectThread(thread.id)}
                      className={`w-full text-left p-2.5 rounded-lg transition-colors hover:bg-accent/50 ${
                        isActive ? "bg-accent" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {thread.title || "New Chat"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatRelativeTime(thread.updatedAt)}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Storage warning banner */}
          <StorageWarningBanner className="m-2" />

          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <span className="font-medium">Unified Chat</span>
              {state.lastResponseId && (
                <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
                  {state.lastResponseId.slice(0, 12)}...
                </span>
              )}
            </div>
          </div>

          {/* Messages area */}
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto"
          >
            {!hasMessages && !isLoading && !hasFinderResults && !finderPending ? (
              // Empty state
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Zap className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-medium mb-2">Unified Chat</h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-4">
                  All features in one place. Chat, branch, run Codex tasks, or
                  find past conversations.
                </p>
                <div className="text-xs text-muted-foreground/70 max-w-sm p-3 bg-muted rounded-lg space-y-2">
                  <p>
                    <strong>Features:</strong>
                  </p>
                  <p>
                    <code className="bg-background px-1 rounded">@codex</code>{" "}
                    &mdash; Generate code with task cards
                  </p>
                  <p>
                    <code className="bg-background px-1 rounded">/find</code>{" "}
                    &mdash; Search past conversations
                  </p>
                  <p>
                    <span className="inline-flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> Branch
                    </span>{" "}
                    &mdash; Click branch on any assistant message
                  </p>
                </div>
              </div>
            ) : (
              // Messages list
              <div className="p-4 space-y-4">
                {messages.map((message) => {
                  // Render TaskCard for task messages
                  if (message.isTaskCard && message.taskId) {
                    const task = tasks[message.taskId]
                    if (!task) return null
                    return (
                      <TaskCard
                        key={`${message.localId}-${message.taskId}`}
                        task={task}
                        workspace={workspace || undefined}
                        onApplyChanges={() => applyTaskChanges(task.id)}
                        onCreatePR={() => createTaskPR(task.id)}
                        onRefresh={async () => { await refreshTask(task.id) }}
                      />
                    )
                  }

                  // Render regular message bubble
                  return (
                    <ChatMessageBubble
                      key={message.localId}
                      message={message}
                      onBranch={handleBranch}
                      branches={branchesByParentLocalId[message.localId] || []}
                      onOpenBranch={handleOpenBranch}
                    />
                  )
                })}

                {/* Finder pending state */}
                {finderPending && (
                  <div className="flex items-start">
                    <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Searching...
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Finder results */}
                {!finderPending && hasFinderResults && (
                  <div className="flex items-start">
                    <div className="max-w-[90%] space-y-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <Search className="h-4 w-4" />
                        <span>
                          Found {finderOptions.length} matching{" "}
                          {finderOptions.length === 1 ? "chat" : "chats"}
                        </span>
                      </div>
                      {finderOptions.map((option) => (
                        <FinderOptionCard
                          key={option.chatId}
                          option={option}
                          onClick={() => handleOpenFoundChat(option.chatId)}
                          isOpening={openingChatId === option.chatId}
                          disabled={openingChatId !== null}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {isLoading && <TypingIndicator />}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="flex items-end gap-2 p-4 border-t border-border bg-card/50">
            <Textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message, @codex to run a task, or /find to search..."
              disabled={isLoading || isMerging}
              rows={1}
              className="min-h-[44px] max-h-[200px] resize-none bg-background"
            />
            <Button
              onClick={handleSend}
              disabled={isLoading || isMerging || !inputValue.trim()}
              size="icon"
              className="h-[44px] w-[44px] shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Branch Overlay */}
        <BranchOverlay
          branch={activeBranch}
          parentMessageText={parentMessageText}
          isOpen={!!activeBranchId}
          onClose={handleCloseBranch}
          onUpdateBranch={handleUpdateBranch}
        />

        {/* Merging overlay - only shown during LLM summarization for longer branches */}
        {isMerging && (
          <div className="fixed inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-card border border-border rounded-xl p-6 shadow-xl flex flex-col items-center gap-4 min-w-[280px]">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <div className="text-center space-y-1">
                <h3 className="text-sm font-medium text-foreground">
                  Preparing branch context
                </h3>
                <p className="text-xs text-muted-foreground">
                  Summarizing conversation...
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

// =============================================================================
// EXPORT WITH SUSPENSE BOUNDARY
// =============================================================================

export default function UnifiedDemo() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <UnifiedDemoContent />
    </Suspense>
  )
}
