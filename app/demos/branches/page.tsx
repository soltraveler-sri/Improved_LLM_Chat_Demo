"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { RotateCcw, MessageSquare } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  ChatMessageBubble,
  TypingIndicator,
  Composer,
  BranchOverlay,
} from "@/components/chat"
import type {
  ChatMessage,
  MainThreadState,
  RespondResponse,
  BranchThread,
} from "@/lib/types"

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

  // Branch state management
  const [branchesByParentLocalId, setBranchesByParentLocalId] = useState<
    Record<string, BranchThread[]>
  >({})
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null)

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
    shouldAutoScroll.current = distanceFromBottom < 100
  }, [])

  // Autoscroll to bottom when new messages arrive
  useEffect(() => {
    if (shouldAutoScroll.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [state.messages, isLoading])

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

  // Handle sending a message in main thread
  const handleSend = async () => {
    const userText = inputValue.trim()
    if (!userText || isLoading) return

    const userMessage: ChatMessage = {
      localId: generateId(),
      role: "user",
      text: userText,
      createdAt: Date.now(),
    }

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

      const assistantMessage: ChatMessage = {
        localId: generateId(),
        role: "assistant",
        text: responseData.output_text,
        createdAt: Date.now(),
        responseId: responseData.id,
      }

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

  // Handle creating a new branch from an assistant message
  const handleBranch = (localId: string, responseId: string) => {
    // Count existing branches for this parent
    const existingBranches = branchesByParentLocalId[localId] || []
    const branchNumber = existingBranches.length + 1

    // Create new branch
    const newBranch: BranchThread = {
      id: generateId(),
      parentAssistantLocalId: localId,
      parentAssistantResponseId: responseId,
      title: `Branch ${branchNumber}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mode: "fast", // Default to fast mode
      includeInMain: false, // Default OFF
      includeMode: "summary",
      messages: [],
      lastResponseId: null,
    }

    // Add to branches map
    setBranchesByParentLocalId((prev) => ({
      ...prev,
      [localId]: [...(prev[localId] || []), newBranch],
    }))

    // Open the new branch
    setActiveBranchId(newBranch.id)
  }

  // Handle opening an existing branch
  const handleOpenBranch = (branchId: string) => {
    setActiveBranchId(branchId)
  }

  // Handle closing the branch overlay
  const handleCloseBranch = () => {
    setActiveBranchId(null)
  }

  // Handle updating a branch (from overlay)
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

  // Reset chat state
  const handleReset = () => {
    setState({
      messages: [],
      lastResponseId: null,
    })
    setBranchesByParentLocalId({})
    setActiveBranchId(null)
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
                  branches={branchesByParentLocalId[message.localId] || []}
                  onOpenBranch={handleOpenBranch}
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

        {/* Branch Overlay */}
        <BranchOverlay
          branch={activeBranch}
          parentMessageText={parentMessageText}
          isOpen={!!activeBranchId}
          onClose={handleCloseBranch}
          onUpdateBranch={handleUpdateBranch}
        />
      </div>
    </TooltipProvider>
  )
}
