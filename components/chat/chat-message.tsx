"use client"

import { GitBranch, GitMerge, List, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { BranchChip } from "./branch-chip"
import type { ChatMessage, BranchThread } from "@/lib/types"

interface ChatMessageProps {
  message: ChatMessage
  onBranch?: (localId: string, responseId: string) => void
  branches?: BranchThread[]
  onOpenBranch?: (branchId: string) => void
}

export function ChatMessageBubble({
  message,
  onBranch,
  branches = [],
  onOpenBranch,
}: ChatMessageProps) {
  const isUser = message.role === "user"
  const isAssistant = message.role === "assistant"
  const isContext = message.role === "context"

  const handleBranch = () => {
    if (isAssistant && message.responseId && onBranch) {
      onBranch(message.localId, message.responseId)
    }
  }

  const handleOpenBranch = (branchId: string) => {
    if (onOpenBranch) {
      onOpenBranch(branchId)
    }
  }

  // Render context card for merged branch content
  if (isContext && message.contextMeta) {
    const { branchTitle, mergeType } = message.contextMeta
    const isSummary = mergeType === "summary"

    return (
      <div className="flex w-full justify-center animate-chip-in">
        <div className="max-w-[90%] w-full">
          <div className="bg-gradient-to-r from-emerald-500/5 via-emerald-500/10 to-emerald-500/5 dark:from-emerald-500/10 dark:via-emerald-500/15 dark:to-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20">
                <GitMerge className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                Context merged from &ldquo;{branchTitle}&rdquo;
              </span>
              <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-600/70 dark:text-emerald-400/70">
                {isSummary ? (
                  <>
                    <List className="h-2.5 w-2.5" />
                    summary
                  </>
                ) : (
                  <>
                    <FileText className="h-2.5 w-2.5" />
                    full
                  </>
                )}
              </span>
            </div>
            {/* Content */}
            <div className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
              {message.text}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "group flex flex-col w-full animate-message-in",
        isUser ? "items-end" : "items-start"
      )}
    >
      <div className="flex w-full" style={{ justifyContent: isUser ? "flex-end" : "flex-start" }}>
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

          {/* Branch button for assistant messages */}
          {isAssistant && message.responseId && (
            <div className="absolute -right-1 top-1/2 -translate-y-1/2 translate-x-full opacity-0 group-hover:opacity-100 transition-opacity">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={handleBranch}
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Branch from here</p>
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </div>

      {/* Branch chips below assistant messages */}
      {isAssistant && branches.length > 0 && (
        <div className="mt-1.5 ml-1">
          <BranchChip branches={branches} onOpenBranch={handleOpenBranch} />
        </div>
      )}
    </div>
  )
}
