"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { GitBranch, Zap, Brain, X } from "lucide-react"
import { toast } from "sonner"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Composer } from "./composer"
import { TypingIndicator } from "./typing-indicator"
import { cn } from "@/lib/utils"
import type { BranchThread, ChatMessage, RespondResponse } from "@/lib/types"

function generateId(): string {
  return crypto.randomUUID()
}

interface BranchOverlayProps {
  branch: BranchThread | null
  parentMessageText: string
  isOpen: boolean
  onClose: () => void
  onUpdateBranch: (updatedBranch: BranchThread) => void
}

export function BranchOverlay({
  branch,
  parentMessageText,
  isOpen,
  onClose,
  onUpdateBranch,
}: BranchOverlayProps) {
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  // Refs for autoscroll behavior
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScroll = useRef(true)

  // Reset input when branch changes
  useEffect(() => {
    setInputValue("")
    shouldAutoScroll.current = true
  }, [branch?.id])

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
    if (shouldAutoScroll.current && branch?.messages.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [branch?.messages, isLoading])

  // Handle mode toggle
  const handleModeChange = (mode: "fast" | "deep") => {
    if (!branch) return
    onUpdateBranch({
      ...branch,
      mode,
      updatedAt: Date.now(),
    })
  }

  // Handle include in main toggle
  const handleIncludeInMainChange = (checked: boolean) => {
    if (!branch) return
    onUpdateBranch({
      ...branch,
      includeInMain: checked,
      updatedAt: Date.now(),
    })
  }

  // Handle sending a message in the branch
  const handleSend = async () => {
    if (!branch) return

    const userText = inputValue.trim()
    if (!userText || isLoading) return

    // Create user message
    const userMessage: ChatMessage = {
      localId: generateId(),
      role: "user",
      text: userText,
      createdAt: Date.now(),
    }

    // Immediately update branch with user message
    const updatedBranchWithUser: BranchThread = {
      ...branch,
      messages: [...branch.messages, userMessage],
      updatedAt: Date.now(),
      // Update title if this is the first message
      title:
        branch.messages.length === 0
          ? userText.slice(0, 30) + (userText.length > 30 ? "..." : "")
          : branch.title,
    }
    onUpdateBranch(updatedBranchWithUser)
    setInputValue("")
    setIsLoading(true)
    shouldAutoScroll.current = true

    try {
      // Determine previous_response_id for chaining
      // If branch has messages, use branch's lastResponseId
      // Otherwise, fork from parent assistant message
      const previousResponseId =
        branch.lastResponseId || branch.parentAssistantResponseId

      const res = await fetch("/api/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: userText,
          previous_response_id: previousResponseId,
          mode: branch.mode,
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

      // Update branch with assistant message and lastResponseId
      const updatedBranchWithAssistant: BranchThread = {
        ...updatedBranchWithUser,
        messages: [...updatedBranchWithUser.messages, assistantMessage],
        lastResponseId: responseData.id,
        updatedAt: Date.now(),
      }
      onUpdateBranch(updatedBranchWithAssistant)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Something went wrong"
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  if (!branch) return null

  const truncatedParentText =
    parentMessageText.length > 60
      ? parentMessageText.slice(0, 60) + "..."
      : parentMessageText

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col p-0 gap-0"
      >
        {/* Header */}
        <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <SheetTitle className="text-base">Side thread</SheetTitle>
            </div>
            {/* Fast/Deep toggle */}
            <div className="flex items-center gap-1 bg-muted rounded-full p-0.5">
              <button
                onClick={() => handleModeChange("fast")}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors",
                  branch.mode === "fast"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Zap className="h-3 w-3" />
                Fast
              </button>
              <button
                onClick={() => handleModeChange("deep")}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors",
                  branch.mode === "deep"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Brain className="h-3 w-3" />
                Deep
              </button>
            </div>
          </div>
          <SheetDescription className="text-xs text-muted-foreground line-clamp-1 text-left">
            Branched from: &ldquo;{truncatedParentText}&rdquo;
          </SheetDescription>
        </SheetHeader>

        {/* Include in main toggle */}
        <div className="px-4 py-2 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="include-in-main"
              className="text-xs text-muted-foreground cursor-pointer"
            >
              Include branch in main chat context
            </Label>
            <Switch
              id="include-in-main"
              checked={branch.includeInMain}
              onCheckedChange={handleIncludeInMainChange}
            />
          </div>
        </div>

        {/* Messages area */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto"
        >
          {branch.messages.length === 0 && !isLoading ? (
            // Empty state
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <GitBranch className="h-5 w-5 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-medium mb-1">Start a side thread</h3>
              <p className="text-xs text-muted-foreground max-w-[200px]">
                Explore alternate ideas without affecting the main conversation.
              </p>
            </div>
          ) : (
            // Messages list
            <div className="p-4 space-y-3">
              {branch.messages.map((message) => (
                <BranchMessage key={message.localId} message={message} />
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
          placeholder="Continue side thread..."
          className="border-t"
        />
      </SheetContent>
    </Sheet>
  )
}

// Simplified message component for branch (no branch button - no nesting)
function BranchMessage({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"

  return (
    <div
      className={cn(
        "flex w-full animate-message-in",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "relative max-w-[85%] rounded-2xl px-3 py-2",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted text-foreground rounded-bl-md"
        )}
      >
        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
          {message.text}
        </p>
      </div>
    </div>
  )
}
