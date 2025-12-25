"use client"

import { useState, useEffect, useMemo } from "react"
import {
  History,
  Search,
  Clock,
  Briefcase,
  Code,
  MessageCircle,
  User,
  Plane,
  ShoppingCart,
  MessageSquare,
  ChevronRight,
  Loader2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type {
  StoredChatCategory,
  StoredChatThreadMeta,
  StoredChatThread,
  StacksMeta,
} from "@/lib/store/types"
import { STORED_CHAT_CATEGORIES, CATEGORY_LABELS } from "@/lib/store/types"

// Icon mapping for categories
const CATEGORY_ICON_MAP: Record<StoredChatCategory, React.ReactNode> = {
  recent: <Clock className="h-4 w-4" />,
  professional: <Briefcase className="h-4 w-4" />,
  coding: <Code className="h-4 w-4" />,
  short_qa: <MessageCircle className="h-4 w-4" />,
  personal: <User className="h-4 w-4" />,
  travel: <Plane className="h-4 w-4" />,
  shopping: <ShoppingCart className="h-4 w-4" />,
}

/**
 * Format a timestamp as a relative time string
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return "just now"
}

/**
 * Format a timestamp as a date string
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export default function HistoryDemo() {
  // State
  const [threads, setThreads] = useState<StoredChatThreadMeta[]>([])
  const [stacksMeta, setStacksMeta] = useState<StacksMeta | null>(null)
  const [selectedCategory, setSelectedCategory] =
    useState<StoredChatCategory | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [selectedThread, setSelectedThread] = useState<StoredChatThread | null>(
    null
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingThread, setIsLoadingThread] = useState(false)

  // Fetch threads and stacks meta on mount
  useEffect(() => {
    async function fetchData() {
      setIsLoading(true)
      try {
        const [threadsRes, metaRes] = await Promise.all([
          fetch("/api/chats"),
          fetch("/api/stacks/meta"),
        ])

        if (threadsRes.ok) {
          const data = await threadsRes.json()
          setThreads(data.threads || [])
        }

        if (metaRes.ok) {
          const data = await metaRes.json()
          setStacksMeta(data)
        }
      } catch (error) {
        console.error("Failed to fetch history data:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  // Fetch selected thread details
  useEffect(() => {
    async function fetchThread() {
      if (!selectedThreadId) {
        setSelectedThread(null)
        return
      }

      setIsLoadingThread(true)
      try {
        const res = await fetch(`/api/chats/${selectedThreadId}`)
        if (res.ok) {
          const data = await res.json()
          setSelectedThread(data.thread || null)
        }
      } catch (error) {
        console.error("Failed to fetch thread:", error)
      } finally {
        setIsLoadingThread(false)
      }
    }

    fetchThread()
  }, [selectedThreadId])

  // Calculate category counts from threads (fallback if meta not available)
  const categoryCounts = useMemo(() => {
    if (stacksMeta?.counts) return stacksMeta.counts

    const counts = {} as Record<StoredChatCategory, number>
    for (const cat of STORED_CHAT_CATEGORIES) {
      counts[cat] = 0
    }
    for (const thread of threads) {
      counts[thread.category] = (counts[thread.category] || 0) + 1
    }
    return counts
  }, [threads, stacksMeta])

  // Filter threads by search query (GLOBAL - always searches all threads)
  // Note: Category filter only affects display, NOT search scope
  const filteredThreads = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()

    // First filter by category (if selected)
    let filtered = selectedCategory
      ? threads.filter((t) => t.category === selectedCategory)
      : threads

    // Then filter by search query (searches title and summary)
    // IMPORTANT: Search is global - when searching, we search ALL threads
    if (query) {
      // When searching, always search ALL threads regardless of category
      filtered = threads.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          (t.summary && t.summary.toLowerCase().includes(query))
      )
    }

    return filtered
  }, [threads, selectedCategory, searchQuery])

  // Total thread count
  const totalCount = threads.length

  return (
    <div className="flex h-full">
      {/* Left sidebar - Category stacks */}
      <div className="w-64 border-r border-border flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <History className="h-5 w-5" />
            History
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Browse past conversations
          </p>
        </div>

        {/* Category list */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {/* All chats option */}
            <button
              onClick={() => setSelectedCategory(null)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors",
                selectedCategory === null
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                <span>All Chats</span>
              </div>
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {totalCount}
              </span>
            </button>

            {/* Separator */}
            <div className="h-px bg-border my-2" />

            {/* Category buttons */}
            {STORED_CHAT_CATEGORIES.map((category) => {
              const count = categoryCounts[category] || 0
              const isSelected = selectedCategory === category

              return (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors",
                    isSelected
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {CATEGORY_ICON_MAP[category]}
                    <span>{CATEGORY_LABELS[category]}</span>
                  </div>
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col">
        {/* Search bar */}
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search all conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="text-xs text-muted-foreground mt-2">
              Searching all conversations (global search)
            </p>
          )}
        </div>

        {/* Content split view */}
        <div className="flex-1 flex overflow-hidden">
          {/* Thread list */}
          <div className="w-80 border-r border-border flex flex-col">
            <ScrollArea className="flex-1">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredThreads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <div className="rounded-full bg-muted p-3 mb-3">
                    <MessageSquare className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">No conversations</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {searchQuery
                      ? "No results match your search"
                      : selectedCategory
                      ? `No ${CATEGORY_LABELS[selectedCategory].toLowerCase()} chats yet`
                      : "Start a chat in Demo 1 to see it here"}
                  </p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {filteredThreads.map((thread) => (
                    <button
                      key={thread.id}
                      onClick={() => setSelectedThreadId(thread.id)}
                      className={cn(
                        "w-full text-left px-3 py-3 rounded-lg transition-colors group",
                        selectedThreadId === thread.id
                          ? "bg-primary/10"
                          : "hover:bg-muted"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "text-sm font-medium truncate",
                                selectedThreadId === thread.id
                                  ? "text-primary"
                                  : "text-foreground"
                              )}
                            >
                              {thread.title}
                            </span>
                          </div>
                          {thread.summary && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {thread.summary}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-muted-foreground/70">
                              {formatRelativeTime(thread.updatedAt)}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                              {CATEGORY_LABELS[thread.category]}
                            </span>
                          </div>
                        </div>
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            selectedThreadId === thread.id
                              ? "text-primary"
                              : "text-muted-foreground/50 group-hover:text-muted-foreground"
                          )}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Transcript view */}
          <div className="flex-1 flex flex-col bg-muted/30">
            {selectedThreadId ? (
              isLoadingThread ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : selectedThread ? (
                <>
                  {/* Thread header */}
                  <div className="p-4 border-b border-border bg-background">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="font-semibold">{selectedThread.title}</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(selectedThread.createdAt)} •{" "}
                          {selectedThread.messages.length} messages
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedThreadId(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Messages */}
                  <ScrollArea className="flex-1">
                    <div className="p-4 space-y-4">
                      {selectedThread.messages.map((message) => (
                        <div
                          key={message.id}
                          className={cn(
                            "flex",
                            message.role === "user"
                              ? "justify-end"
                              : "justify-start"
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[80%] rounded-2xl px-4 py-3",
                              message.role === "user"
                                ? "bg-primary text-primary-foreground rounded-br-md"
                                : message.role === "context"
                                ? "bg-amber-500/10 text-foreground border border-amber-500/20 rounded-bl-md"
                                : "bg-card text-card-foreground border border-border rounded-bl-md"
                            )}
                          >
                            {message.role === "context" && (
                              <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mb-1">
                                CONTEXT
                              </div>
                            )}
                            <p className="text-sm whitespace-pre-wrap">
                              {message.text}
                            </p>
                            <p
                              className={cn(
                                "text-[10px] mt-1",
                                message.role === "user"
                                  ? "text-primary-foreground/70"
                                  : "text-muted-foreground/70"
                              )}
                            >
                              {formatRelativeTime(message.createdAt)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-muted-foreground">Thread not found</p>
                </div>
              )
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <MessageSquare className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">Select a conversation</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Choose a conversation from the list to view its transcript.
                  Search is global and always searches all conversations.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
