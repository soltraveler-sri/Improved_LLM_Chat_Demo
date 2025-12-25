"use client"

import { useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Check,
  AlertCircle,
  ExternalLink,
  Copy,
  Play,
  GitPullRequest,
  FileCode,
  ListOrdered,
  ScrollText,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { CodexTask, WorkspaceSnapshot } from "@/lib/codex/types"
import { TASK_STATUS_LABELS, TASK_STATUS_COLORS } from "@/lib/codex/types"

interface TaskCardProps {
  task: CodexTask
  workspace?: WorkspaceSnapshot
  onApplyChanges: () => Promise<void>
  onCreatePR: () => Promise<void>
  onRefresh: () => Promise<void>
}

type TabId = "overview" | "changes" | "logs"

export function TaskCard({
  task,
  workspace,
  onApplyChanges,
  onCreatePR,
  onRefresh,
}: TaskCardProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>("overview")
  const [isApplying, setIsApplying] = useState(false)
  const [isCreatingPR, setIsCreatingPR] = useState(false)

  const isRunning = task.status === "running" || task.status === "queued"
  const canApply =
    task.status === "draft_ready" && !isApplying && !isCreatingPR
  const canCreatePR =
    (task.status === "applied" || task.status === "draft_ready") &&
    !isApplying &&
    !isCreatingPR &&
    !task.prUrl
  const hasError = task.status === "failed"

  const handleApply = async () => {
    setIsApplying(true)
    try {
      await onApplyChanges()
      toast.success("Changes applied successfully")
    } catch {
      toast.error("Failed to apply changes")
    } finally {
      setIsApplying(false)
    }
  }

  const handleCreatePR = async () => {
    setIsCreatingPR(true)
    try {
      await onCreatePR()
      toast.success("PR created successfully")
    } catch {
      toast.error("Failed to create PR")
    } finally {
      setIsCreatingPR(false)
    }
  }

  const handleCopyDiff = () => {
    if (task.diffUnified) {
      navigator.clipboard.writeText(task.diffUnified)
      toast.success("Diff copied to clipboard")
    }
  }

  // Collapsed view
  if (!isExpanded) {
    return (
      <div
        className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(true)}
      >
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isRunning && (
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          )}
          {task.status === "draft_ready" && (
            <FileCode className="h-4 w-4 text-amber-500" />
          )}
          {task.status === "applied" && (
            <Check className="h-4 w-4 text-green-500" />
          )}
          {task.status === "pr_created" && (
            <GitPullRequest className="h-4 w-4 text-purple-500" />
          )}
          {hasError && <AlertCircle className="h-4 w-4 text-red-500" />}
          <span className="text-sm font-medium truncate">
            Codex task • {task.title || "Processing..."}
          </span>
        </div>
        <span
          className={cn(
            "text-[10px] px-2 py-0.5 rounded-full",
            TASK_STATUS_COLORS[task.status]
          )}
        >
          {TASK_STATUS_LABELS[task.status]}
        </span>
      </div>
    )
  }

  // Expanded view
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-border cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setIsExpanded(false)}
      >
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isRunning && (
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          )}
          <span className="text-sm font-medium truncate">
            {task.title || "Processing..."}
          </span>
        </div>
        <span
          className={cn(
            "text-[10px] px-2 py-0.5 rounded-full",
            TASK_STATUS_COLORS[task.status]
          )}
        >
          {TASK_STATUS_LABELS[task.status]}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <TabButton
          active={activeTab === "overview"}
          onClick={() => setActiveTab("overview")}
          icon={<ListOrdered className="h-3 w-3" />}
          label="Overview"
        />
        <TabButton
          active={activeTab === "changes"}
          onClick={() => setActiveTab("changes")}
          icon={<FileCode className="h-3 w-3" />}
          label={`Changes (${task.changes.length})`}
        />
        <TabButton
          active={activeTab === "logs"}
          onClick={() => setActiveTab("logs")}
          icon={<ScrollText className="h-3 w-3" />}
          label="Logs"
        />
      </div>

      {/* Tab content */}
      <div className="p-4">
        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* Prompt */}
            <div>
              <p className="text-[10px] uppercase text-muted-foreground mb-1">
                Prompt
              </p>
              <p className="text-sm text-foreground">{task.prompt}</p>
            </div>

            {/* Plan */}
            {task.planMarkdown && (
              <div>
                <p className="text-[10px] uppercase text-muted-foreground mb-1">
                  Plan
                </p>
                <div className="text-sm text-foreground prose prose-sm dark:prose-invert max-w-none">
                  <div className="whitespace-pre-wrap">{task.planMarkdown}</div>
                </div>
              </div>
            )}

            {/* Error */}
            {task.error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">
                  {task.error}
                </p>
              </div>
            )}

            {/* PR Link */}
            {task.prUrl && (
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <GitPullRequest className="h-4 w-4 text-purple-500" />
                  <a
                    href={task.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                  >
                    {task.prUrl}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "changes" && (
          <div className="space-y-3">
            {task.changes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {isRunning ? "Generating changes..." : "No changes"}
              </p>
            ) : (
              task.changes.map((change, idx) => (
                <FileChangeView
                  key={idx}
                  change={change}
                  currentContent={workspace?.files[change.path]}
                />
              ))
            )}
          </div>
        )}

        {activeTab === "logs" && (
          <ScrollArea className="h-[200px]">
            <div className="space-y-1 font-mono text-xs">
              {task.logs.map((log, idx) => (
                <div
                  key={idx}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="text-muted-foreground/50 mr-2">
                    [{String(idx + 1).padStart(2, "0")}]
                  </span>
                  {log}
                </div>
              ))}
              {isRunning && (
                <div className="flex items-center gap-2 text-blue-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Processing...
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Actions */}
      {!isRunning && !hasError && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-muted/30">
          {canApply && (
            <Button
              size="sm"
              onClick={handleApply}
              disabled={isApplying}
              className="gap-1.5"
            >
              {isApplying ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              Apply Changes
            </Button>
          )}

          {canCreatePR && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleCreatePR}
              disabled={isCreatingPR}
              className="gap-1.5"
            >
              {isCreatingPR ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <GitPullRequest className="h-3 w-3" />
              )}
              Create PR
            </Button>
          )}

          {task.diffUnified && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCopyDiff}
              className="gap-1.5"
            >
              <Copy className="h-3 w-3" />
              Copy Diff
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            className="ml-auto"
          >
            Refresh
          </Button>
        </div>
      )}

      {/* Running state actions */}
      {isRunning && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-muted/30">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          <span className="text-sm text-muted-foreground">
            Generating changes...
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            className="ml-auto"
          >
            Refresh
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * Tab button component
 */
function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 text-xs transition-colors",
        active
          ? "text-primary border-b-2 border-primary -mb-px"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  )
}

/**
 * File change view component
 */
function FileChangeView({
  change,
  currentContent,
}: {
  change: { path: string; before?: string; after: string }
  currentContent?: string
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isNew = !change.before
  const isModified = !!change.before && change.before !== change.after
  const isApplied = currentContent === change.after

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
        <span className="text-xs font-mono flex-1">{change.path}</span>
        <span
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded",
            isNew && "bg-green-500/20 text-green-600 dark:text-green-400",
            isModified && "bg-amber-500/20 text-amber-600 dark:text-amber-400"
          )}
        >
          {isNew ? "NEW" : "MODIFIED"}
        </span>
        {isApplied && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-600 dark:text-green-400">
            APPLIED
          </span>
        )}
      </div>

      {isExpanded && (
        <ScrollArea className="max-h-[300px]">
          <pre className="p-3 text-xs font-mono whitespace-pre-wrap bg-muted/20">
            {change.after}
          </pre>
        </ScrollArea>
      )}
    </div>
  )
}
