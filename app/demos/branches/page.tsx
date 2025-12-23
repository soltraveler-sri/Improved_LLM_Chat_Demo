"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { RotateCcw, MessageSquare } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ChatMessageBubble, TypingIndicator, Composer } from "@/components/chat"
import type { ChatMessage, MainThreadState, RespondResponse } from "@/lib/types"

function generateId(): string {
  return crypto.randomUUID()
}

export default function BranchesDemo() {
  // Main thread state
  const [state, setState] = useState<MainThreadState>({
    messages: [],
    lastResponseId: null,
  })
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  // Refs for autoscroll behavior
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScroll = useRef(true)

  // Track if user has scrolled away from bottom
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const { scrollTop, scrollHeight, clientHeight } = container
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
    // Consider "at bottom" if within 100px
    shouldAutoScroll.current = distanceFromBottom < 100
  }, [])

  // Autoscroll to bottom when new messages arrive
  useEffect(() => {
    if (shouldAutoScroll.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [state.messages, isLoading])

  // Handle sending a message
  const handleSend = async () => {
    const userText = inputValue.trim()
    if (!userText || isLoading) return

    // Create user message
    const userMessage: ChatMessage = {
      localId: generateId(),
      role: "user",
      text: userText,
      createdAt: Date.now(),
    }

    // Immediately append user message and clear input
    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, userMessage],
    }))
    setInputValue("")
    setIsLoading(true)
    shouldAutoScroll.current = true

    try {
      const res = await fetch("/api/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: userText,
          previous_response_id: state.lastResponseId,
          mode: "deep",
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to get response")
      }

      const responseData = data as RespondResponse

      // Create assistant message with responseId
      const assistantMessage: ChatMessage = {
        localId: generateId(),
        role: "assistant",
        text: responseData.output_text,
        createdAt: Date.now(),
        responseId: responseData.id,
      }

      // Append assistant message and update lastResponseId
      setState((prev) => ({
        messages: [...prev.messages, assistantMessage],
        lastResponseId: responseData.id,
      }))
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Something went wrong"
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  // Handle branch button click (stub for PR #3)
  const handleBranch = (localId: string, responseId: string) => {
    console.log("Branch requested:", { localId, responseId })
    toast.info("Branching will be available in the next update!", {
      description: `Response ID: ${responseId.slice(0, 20)}...`,
    })
  }

  // Reset chat state
  const handleReset = () => {
    setState({
      messages: [],
      lastResponseId: null,
    })
    setInputValue("")
    toast.success("Chat cleared")
  }

  const hasMessages = state.messages.length > 0

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Chat</span>
            {state.lastResponseId && (
              <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
                {state.lastResponseId.slice(0, 12)}...
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={!hasMessages && !inputValue}
            className="gap-1.5"
          >
            <RotateCcw className="h-4 w-4" />
            New chat
          </Button>
        </div>

        {/* Messages area */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto"
        >
          {!hasMessages && !isLoading ? (
            // Empty state
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">Start a conversation</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Send a message to begin chatting. Your conversation will be
                tracked using OpenAI&apos;s Responses API with response chaining.
              </p>
            </div>
          ) : (
            // Messages list
            <div className="p-4 space-y-4">
              {state.messages.map((message) => (
                <ChatMessageBubble
                  key={message.localId}
                  message={message}
                  onBranch={handleBranch}
                />
              ))}
              {isLoading && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Composer */}
        <Composer
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          disabled={isLoading}
          placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
        />
      </div>
    </TooltipProvider>
  )
}
