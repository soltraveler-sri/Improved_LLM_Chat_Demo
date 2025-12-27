"use client"

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Send, Loader2, Search, MessageSquare, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { FinderOptionCard, type FinderOption } from "./finder-option-card"
import type { StoredChatThread, StoredChatCategory } from "@/lib/store/types"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IntentResponse {
  intent: "retrieve_chat" | "normal_chat"
  confidence: number
  rewrittenQuery: string
}

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

interface EphemeralMessage {
  id: string
  role: "user" | "assistant"
  text: string
  createdAt: number
}

// For normal chat messages (persisted)
interface Demo2Message {
  id: string
  role: "user" | "assistant"
  text: string
  createdAt: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return crypto.randomUUID()
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  if (seconds > 10) return `${seconds}s ago`
  return "just now"
}

/**
 * Determine if we should auto-open based on confidence.
 * Rules:
 * - If only one option and confidence >= 0.75, auto-open
 * - If top.confidence >= 0.85 AND (top - second) >= 0.15, auto-open
 */
function shouldAutoOpen(options: FinderOption[]): boolean {
  if (options.length === 0) return false
  if (options.length === 1) {
    return options[0].confidence >= 0.75
  }
  const top = options[0].confidence
  const second = options[1].confidence
  return top >= 0.85 && top - second >= 0.15
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FinderViewProps {
  /**
   * Currently selected chat ID (from URL)
   */
  currentChatId: string | null
  /**
   * Current chat data (null if no chat selected or loading)
   */
  currentChat: StoredChatThread | null
  /**
   * Callback when a chat should be opened (handles both replace and push)
   */
  onOpenChat: (chatId: string, useReplace: boolean) => void
  /**
   * Whether the current chat is being loaded
   */
  isLoadingChat?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FinderView({
  currentChatId,
  currentChat,
  onOpenChat,
  isLoadingChat = false,
}: FinderViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Composer state
  const [inputValue, setInputValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Ephemeral finder state (not persisted)
  const [finderPending, setFinderPending] = useState(false)
  const [finderQuery, setFinderQuery] = useState<string | null>(null)
  const [finderOptions, setFinderOptions] = useState<FinderOption[]>([])
  const [openingChatId, setOpeningChatId] = useState<string | null>(null)

  // Normal chat state (for when intent is normal_chat)
  const [messages, setMessages] = useState<Demo2Message[]>([])
  const [isResponding, setIsResponding] = useState(false)
  const [lastResponseId, setLastResponseId] = useState<string | null>(null)

  // Refs for autoscroll
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScroll = useRef(true)

  // Track if user has scrolled away from bottom
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const { scrollTop, scrollHeight, clientHeight } = container
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
    shouldAutoScroll.current = distanceFromBottom < 100
  }, [])

  // Autoscroll to bottom when new content arrives
  useEffect(() => {
    if (shouldAutoScroll.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, finderOptions, finderPending, isResponding])

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = "auto"
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [inputValue])

  // Determine session state
  const isEmptySession = !currentChatId || (currentChat?.messages.length === 0)
  const isMidChat = !isEmptySession && (currentChat?.messages.length ?? 0) > 0

  // Clear ephemeral state when chat changes
  useEffect(() => {
    setFinderQuery(null)
    setFinderOptions([])
    setOpeningChatId(null)
  }, [currentChatId])

  // ---------------------------------------------------------------------------
  // Handle opening a chat
  // ---------------------------------------------------------------------------
  const handleOpenChat = useCallback(
    async (chatId: string, useReplace: boolean) => {
      setOpeningChatId(chatId)

      // Wait 500ms for the transition effect
      await new Promise((resolve) => setTimeout(resolve, 500))

      onOpenChat(chatId, useReplace)

      // Clear ephemeral state after navigation
      setFinderQuery(null)
      setFinderOptions([])
      setOpeningChatId(null)
    },
    [onOpenChat]
  )

  // ---------------------------------------------------------------------------
  // Handle sending a message
  // ---------------------------------------------------------------------------
  const handleSend = async () => {
    const userText = inputValue.trim()
    if (!userText || finderPending || isResponding) return

    setInputValue("")
    shouldAutoScroll.current = true

    // Check for /find command shortcut
    if (userText.startsWith("/find ")) {
      const query = userText.slice(6).trim()
      if (!query) {
        toast.error("Please provide a search query after /find")
        return
      }
      await handleFindCommand(query)
      return
    }

    // Step 1: Call intent detection API
    setFinderPending(true)

    try {
      const intentRes = await fetch("/api/chats/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText,
          context: {
            isEmptySession,
            isMidChat,
          },
        }),
      })

      if (!intentRes.ok) {
        const data = await intentRes.json()
        throw new Error(data.error || "Failed to detect intent")
      }

      const intentData: IntentResponse = await intentRes.json()

      if (intentData.intent === "retrieve_chat") {
        // User wants to find a past chat
        await handleRetrieveChat(userText, intentData.rewrittenQuery)
      } else {
        // Normal chat - proceed with regular response
        setFinderPending(false)
        await handleNormalChat(userText)
      }
    } catch (error) {
      setFinderPending(false)
      const errorMessage =
        error instanceof Error ? error.message : "Something went wrong"
      toast.error(errorMessage)
    }
  }

  // ---------------------------------------------------------------------------
  // Handle /find command (direct search, skip intent detection)
  // ---------------------------------------------------------------------------
  const handleFindCommand = async (query: string) => {
    setFinderPending(true)
    setFinderQuery(query)

    try {
      const findRes = await fetch("/api/chats/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      })

      if (!findRes.ok) {
        const data = await findRes.json()
        throw new Error(data.error || "Failed to find chats")
      }

      const findData: FindResponse = await findRes.json()

      // Map to FinderOption format
      const options: FinderOption[] = findData.options.map((opt) => ({
        chatId: opt.chatId,
        title: opt.title,
        summary: opt.summary,
        updatedAt: opt.updatedAt,
        confidence: opt.confidence,
        why: opt.why,
      }))

      setFinderOptions(options)
      setFinderPending(false)

      // Handle auto-open for empty session
      if (isEmptySession && shouldAutoOpen(options)) {
        await handleOpenChat(options[0].chatId, true) // router.replace
      }
    } catch (error) {
      setFinderPending(false)
      const errorMessage =
        error instanceof Error ? error.message : "Failed to search"
      toast.error(errorMessage)
    }
  }

  // ---------------------------------------------------------------------------
  // Handle retrieve_chat intent
  // ---------------------------------------------------------------------------
  const handleRetrieveChat = async (
    originalQuery: string,
    rewrittenQuery: string
  ) => {
    setFinderQuery(originalQuery)

    try {
      const findRes = await fetch("/api/chats/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: rewrittenQuery || originalQuery }),
      })

      if (!findRes.ok) {
        const data = await findRes.json()
        throw new Error(data.error || "Failed to find chats")
      }

      const findData: FindResponse = await findRes.json()

      // Map to FinderOption format
      const options: FinderOption[] = findData.options.map((opt) => ({
        chatId: opt.chatId,
        title: opt.title,
        summary: opt.summary,
        updatedAt: opt.updatedAt,
        confidence: opt.confidence,
        why: opt.why,
      }))

      setFinderOptions(options)
      setFinderPending(false)

      if (options.length === 0) {
        toast.info("No matching chats found")
        return
      }

      // Handle auto-open for empty session
      if (isEmptySession && shouldAutoOpen(options)) {
        await handleOpenChat(options[0].chatId, true) // router.replace
      }
      // In mid-chat, always show options (require click)
    } catch (error) {
      setFinderPending(false)
      const errorMessage =
        error instanceof Error ? error.message : "Failed to search"
      toast.error(errorMessage)
    }
  }

  // ---------------------------------------------------------------------------
  // Handle normal chat (not a retrieval request)
  // ---------------------------------------------------------------------------
  const handleNormalChat = async (userText: string) => {
    // Create user message for UI
    const userMessage: Demo2Message = {
      id: generateId(),
      role: "user",
      text: userText,
      createdAt: Date.now(),
    }

    setMessages((prev) => [...prev, userMessage])
    setIsResponding(true)

    try {
      // Send to /api/respond
      const res = await fetch("/api/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: userText,
          previous_response_id: lastResponseId,
          mode: "deep",
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to get response")
      }

      // Add assistant message to UI
      const assistantMessage: Demo2Message = {
        id: generateId(),
        role: "assistant",
        text: data.output_text,
        createdAt: Date.now(),
      }

      setMessages((prev) => [...prev, assistantMessage])
      setLastResponseId(data.id)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Something went wrong"
      toast.error(errorMessage)
    } finally {
      setIsResponding(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Handle option card click
  // ---------------------------------------------------------------------------
  const handleOptionClick = async (option: FinderOption) => {
    // In mid-chat, use router.push so browser back returns
    // In empty session, use router.replace (no back entry)
    const useReplace = isEmptySession
    await handleOpenChat(option.chatId, useReplace)
  }

  // ---------------------------------------------------------------------------
  // Handle keyboard events
  // ---------------------------------------------------------------------------
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter adds newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (inputValue.trim() && !finderPending && !isResponding) {
        handleSend()
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Determine what to show
  // ---------------------------------------------------------------------------
  const hasEphemeralContent = finderQuery !== null || finderOptions.length > 0
  const hasMessages = messages.length > 0
  const showEmptyState = !hasEphemeralContent && !hasMessages && !finderPending && !isResponding

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-full">
      {/* Messages/Results area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {showEmptyState ? (
          // Empty state
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Search className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-medium mb-2">Find a Conversation</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">
              Type naturally to find a past chat, or just start a new conversation.
            </p>
            <div className="text-xs text-muted-foreground/70 max-w-sm p-3 bg-muted rounded-lg space-y-2">
              <p>
                <strong>Examples:</strong>
              </p>
              <p>&quot;Find my conversation about React hooks&quot;</p>
              <p>&quot;Where did we discuss the API design?&quot;</p>
              <p>&quot;/find travel planning&quot; (direct search)</p>
            </div>
          </div>
        ) : (
          // Content area
          <div className="p-4 space-y-4">
            {/* Ephemeral finder query (user bubble) */}
            {finderQuery && (
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 bg-primary text-primary-foreground">
                  <div className="flex items-center gap-1 mb-1 text-[10px] text-primary-foreground/70">
                    <Search className="h-3 w-3" />
                    <span>Finding chat...</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                    {finderQuery}
                  </p>
                </div>
              </div>
            )}

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

            {/* Finder options (assistant bubble with cards) */}
            {!finderPending && finderOptions.length > 0 && (
              <div className="flex items-start">
                <div className="max-w-[90%] space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <Sparkles className="h-4 w-4" />
                    <span>
                      Found {finderOptions.length} matching{" "}
                      {finderOptions.length === 1 ? "chat" : "chats"}
                    </span>
                  </div>
                  {finderOptions.map((option) => (
                    <FinderOptionCard
                      key={option.chatId}
                      option={option}
                      onClick={() => handleOptionClick(option)}
                      isOpening={openingChatId === option.chatId}
                      disabled={openingChatId !== null}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* No results message */}
            {!finderPending && finderQuery && finderOptions.length === 0 && (
              <div className="flex items-start">
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                  <p className="text-sm text-muted-foreground">
                    No matching chats found. Try a different search or start a
                    new conversation.
                  </p>
                </div>
              </div>
            )}

            {/* Normal chat messages */}
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md"
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                    {message.text}
                  </p>
                  <p
                    className={cn(
                      "text-[10px] mt-1",
                      message.role === "user"
                        ? "text-primary-foreground/60"
                        : "text-muted-foreground/60"
                    )}
                  >
                    {formatRelativeTime(message.createdAt)}
                  </p>
                </div>
              </div>
            ))}

            {/* Responding state */}
            {isResponding && (
              <div className="flex items-start">
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Thinking...
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-card/50">
        <div className="flex items-end gap-2 p-4">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Find a chat or start a conversation..."
            disabled={finderPending || isResponding}
            rows={1}
            className="min-h-[44px] max-h-[200px] resize-none bg-background"
          />
          <Button
            onClick={handleSend}
            disabled={finderPending || isResponding || !inputValue.trim()}
            size="icon"
            className="h-[44px] w-[44px] shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
