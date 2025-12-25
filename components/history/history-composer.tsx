"use client"

import { useRef, useEffect, useState, KeyboardEvent } from "react"
import { Send, Plus, X, MessageCircle, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  PastChatPickerModal,
  type AttachedChat,
} from "./past-chat-picker-modal"
import { CATEGORY_LABELS, type StoredChatCategory } from "@/lib/store/types"

interface HistoryComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: (attachedChats: AttachedChat[]) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}

/**
 * Composer component for Demo 2 with past chat attachment support.
 * This is a separate component from Demo 1's Composer to avoid any changes to Demo 1.
 */
export function HistoryComposer({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Type a message...",
  className,
}: HistoryComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [attachedChats, setAttachedChats] = useState<AttachedChat[]>([])
  const [isPickerOpen, setIsPickerOpen] = useState(false)

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = "auto"
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [value])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter adds newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !disabled) {
        handleSend()
      }
    }
  }

  const handleSend = () => {
    if (value.trim() && !disabled) {
      onSend(attachedChats)
      // Clear attachments after sending
      setAttachedChats([])
    }
  }

  const handleAddChat = (chat: AttachedChat) => {
    // Don't add duplicates
    if (attachedChats.find((c) => c.chatId === chat.chatId)) return
    setAttachedChats((prev) => [...prev, chat])
  }

  const handleRemoveChat = (chatId: string) => {
    setAttachedChats((prev) => prev.filter((c) => c.chatId !== chatId))
  }

  const selectedChatIds = attachedChats.map((c) => c.chatId)

  return (
    <div className={cn("border-t border-border bg-card/50", className)}>
      {/* Attached chats chips */}
      {attachedChats.length > 0 && (
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              Context attached:
            </span>
            {attachedChats.map((chat) => (
              <AttachedChatChip
                key={chat.chatId}
                chat={chat}
                onRemove={() => handleRemoveChat(chat.chatId)}
              />
            ))}
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="p-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                  <Info className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                <p>
                  <strong>Demo uses summaries.</strong> A production version
                  would retrieve only relevant snippets from the past chat (like
                  file/web retrieval) instead of a whole summary.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 p-4 pt-2">
        {/* Add past chat button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsPickerOpen(true)}
              disabled={disabled}
              className="h-[44px] w-[44px] shrink-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Add past chat as context</p>
          </TooltipContent>
        </Tooltip>

        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="min-h-[44px] max-h-[200px] resize-none bg-background"
        />
        <Button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          size="icon"
          className="h-[44px] w-[44px] shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* Past chat picker modal */}
      <PastChatPickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={handleAddChat}
        selectedChatIds={selectedChatIds}
      />
    </div>
  )
}

/**
 * Chip component for attached chats
 */
function AttachedChatChip({
  chat,
  onRemove,
}: {
  chat: AttachedChat
  onRemove: () => void
}) {
  return (
    <div className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-full text-xs">
      <MessageCircle className="h-3 w-3" />
      <span className="max-w-[150px] truncate">{chat.title}</span>
      <span className="text-primary/60">
        ({CATEGORY_LABELS[chat.category as StoredChatCategory]})
      </span>
      <button
        onClick={onRemove}
        className="ml-0.5 p-0.5 hover:bg-primary/20 rounded-full transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
