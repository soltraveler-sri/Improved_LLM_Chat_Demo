"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  RotateCcw,
  Loader2,
  Send,
  Terminal,
  FileCode,
  FolderOpen,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { TaskCard } from "@/components/codex"
import { StorageWarningBanner } from "@/components/ui/storage-warning-banner"
import type { CodexTask, WorkspaceSnapshot } from "@/lib/codex/types"

/**
 * Message types for the Demo 3 chat
 */
type MessageType = "user" | "assistant" | "task"

interface ChatMessage {
  id: string
  type: MessageType
  text?: string
  taskId?: string
  createdAt: number
}

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

export default function CodexDemoPage() {
  // State
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [tasks, setTasks] = useState<Record<string, CodexTask>>({})
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null)
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [lastResponseId, setLastResponseId] = useState<string | null>(null)
  const [showWorkspace, setShowWorkspace] = useState(false)

  // Refs for autoscroll
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const shouldAutoScroll = useRef(true)

  // Fetch initial workspace
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
  }, [messages, isLoading])

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = "auto"
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [inputValue])

  // Refresh a task
  const refreshTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/codex/tasks/${taskId}`)
      if (res.ok) {
        const data = await res.json()
        setTasks((prev) => ({ ...prev, [taskId]: data.task }))
      }
    } catch (error) {
      console.error("Failed to refresh task:", error)
    }
  }

  // Apply task changes
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

  // Create PR
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

  // Handle sending a message
  const handleSend = async () => {
    const text = inputValue.trim()
    if (!text || isLoading) return

    // Add user message
    const userMessage: ChatMessage = {
      id: generateId(),
      type: "user",
      text,
      createdAt: Date.now(),
    }
    setMessages((prev) => [...prev, userMessage])
    setInputValue("")
    setIsLoading(true)
    shouldAutoScroll.current = true

    try {
      if (isCodexCommand(text)) {
        // Handle @codex command
        const prompt = extractCodexPrompt(text)

        // Create task via API
        const res = await fetch("/api/codex/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || "Failed to create task")
        }

        const task = data.task as CodexTask

        // Store task
        setTasks((prev) => ({ ...prev, [task.id]: task }))

        // Add task card message
        const taskMessage: ChatMessage = {
          id: generateId(),
          type: "task",
          taskId: task.id,
          createdAt: Date.now(),
        }
        setMessages((prev) => [...prev, taskMessage])

        // Poll for completion if still running
        if (task.status === "running" || task.status === "queued") {
          // The task is created synchronously and waits for completion
          // so we just refresh once
          await refreshTask(task.id)
        }
      } else {
        // Regular chat message - send to /api/respond
        const res = await fetch("/api/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: text,
            previous_response_id: lastResponseId,
            mode: "deep",
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || "Failed to get response")
        }

        // Add assistant message
        const assistantMessage: ChatMessage = {
          id: generateId(),
          type: "assistant",
          text: data.output_text,
          createdAt: Date.now(),
        }
        setMessages((prev) => [...prev, assistantMessage])
        setLastResponseId(data.id)
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Something went wrong"
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (inputValue.trim() && !isLoading) {
        handleSend()
      }
    }
  }

  // Reset chat
  const handleReset = () => {
    setMessages([])
    setTasks({})
    setLastResponseId(null)
    setInputValue("")
    toast.success("Chat cleared")
  }

  const hasMessages = messages.length > 0

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col">
        {/* Storage warning banner */}
        <StorageWarningBanner className="m-2" />

        <div className="flex flex-1 overflow-hidden">
          {/* Main chat area */}
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-primary" />
              <span className="font-medium">Codex Demo</span>
              {lastResponseId && (
                <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
                  {lastResponseId.slice(0, 12)}...
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowWorkspace(!showWorkspace)}
                className="gap-1.5"
              >
                <FolderOpen className="h-4 w-4" />
                Workspace
              </Button>
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
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Terminal className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-medium mb-2">Codex Demo</h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-4">
                  Type <code className="bg-muted px-1.5 py-0.5 rounded">@codex</code>{" "}
                  followed by a task description to generate code changes.
                </p>
                <div className="text-xs text-muted-foreground/70 max-w-sm p-3 bg-muted rounded-lg">
                  <strong>Example:</strong>{" "}
                  <code>@codex add a health check endpoint to the API</code>
                </div>
              </div>
            ) : (
              // Messages list
              <div className="p-4 space-y-4">
                {messages.map((message) => {
                  if (message.type === "task" && message.taskId) {
                    const task = tasks[message.taskId]
                    if (!task) return null
                    return (
                      <TaskCard
                        key={message.id}
                        task={task}
                        workspace={workspace || undefined}
                        onApplyChanges={() => applyTaskChanges(task.id)}
                        onCreatePR={() => createTaskPR(task.id)}
                        onRefresh={() => refreshTask(task.id)}
                      />
                    )
                  }

                  return (
                    <MessageBubble key={message.id} message={message} />
                  )
                })}
                {isLoading && (
                  <div className="flex items-start gap-3">
                    <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Processing...
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
          <div className="flex items-end gap-2 p-4 border-t border-border bg-card/50">
            <Textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message or @codex to run a task..."
              disabled={isLoading}
              rows={1}
              className="min-h-[44px] max-h-[200px] resize-none bg-background"
            />
            <Button
              onClick={handleSend}
              disabled={isLoading || !inputValue.trim()}
              size="icon"
              className="h-[44px] w-[44px] shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Workspace panel */}
        {showWorkspace && workspace && (
          <div className="w-80 border-l border-border flex flex-col">
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-2 font-medium">
                <FolderOpen className="h-4 w-4" />
                Workspace Files
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Demo project files
              </p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {Object.keys(workspace.files)
                  .sort()
                  .map((path) => (
                    <WorkspaceFileItem
                      key={path}
                      path={path}
                      content={workspace.files[path]}
                    />
                  ))}
              </div>
            </ScrollArea>
          </div>
        )}
        </div>
      </div>
    </TooltipProvider>
  )
}

/**
 * Message bubble component
 */
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.type === "user"

  return (
    <div
      className={cn(
        "flex flex-col w-full",
        isUser ? "items-end" : "items-start"
      )}
    >
      <div
        className={cn(
          "relative max-w-[80%] rounded-2xl px-4 py-2.5",
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

/**
 * Workspace file item component
 */
function WorkspaceFileItem({
  path,
  content,
}: {
  path: string
  content: string
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
      >
        <FileCode className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs font-mono flex-1 truncate">{path}</span>
      </button>
      {isExpanded && (
        <ScrollArea className="max-h-[200px]">
          <pre className="p-2 text-[10px] font-mono bg-muted/30 whitespace-pre-wrap">
            {content}
          </pre>
        </ScrollArea>
      )}
    </div>
  )
}
