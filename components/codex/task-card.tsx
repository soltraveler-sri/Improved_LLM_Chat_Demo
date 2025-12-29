"use client"

import { useState, useEffect } from "react"
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
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { CodexTask, CodexFileChange, WorkspaceSnapshot } from "@/lib/codex/types"
import { TASK_STATUS_LABELS, TASK_STATUS_COLORS } from "@/lib/codex/types"

// =============================================================================
// Types
// =============================================================================

interface TaskCardProps {
  task: CodexTask
  workspace?: WorkspaceSnapshot
  onApplyChanges: () => Promise<void>
  onCreatePR: () => Promise<void>
  onRefresh: () => Promise<void>
}

// Progress stages for running state
const PROGRESS_STAGES = [
  { text: "Planning...", duration: 1500 },
  { text: "Analyzing workspace...", duration: 2000 },
  { text: "Drafting changes...", duration: 3000 },
  { text: "Formatting diff...", duration: 1500 },
  { text: "Almost there...", duration: 2000 },
]

// =============================================================================
// Main TaskCard Component
// =============================================================================

export function TaskCard({
  task,
  workspace,
  onApplyChanges,
  onCreatePR,
  onRefresh,
}: TaskCardProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
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

  // Auto-select first file when changes are available
  useEffect(() => {
    if (task.changes.length > 0 && !selectedFilePath) {
      setSelectedFilePath(task.changes[0].path)
    }
  }, [task.changes, selectedFilePath])

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

  // Get the selected file change
  const selectedChange = task.changes.find((c) => c.path === selectedFilePath)

  // =============================================================================
  // Collapsed State
  // =============================================================================

  if (!isExpanded) {
    return (
      <div
        className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(true)}
      >
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isRunning && (
            <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
          )}
          {task.status === "draft_ready" && (
            <FileCode className="h-4 w-4 text-amber-500 shrink-0" />
          )}
          {task.status === "applied" && (
            <Check className="h-4 w-4 text-green-500 shrink-0" />
          )}
          {task.status === "pr_created" && (
            <GitPullRequest className="h-4 w-4 text-purple-500 shrink-0" />
          )}
          {hasError && <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
          <span className="text-sm font-medium truncate">
            Codex task • {task.title || "Processing..."}
          </span>
        </div>
        <span
          className={cn(
            "text-[10px] px-2 py-0.5 rounded-full shrink-0",
            TASK_STATUS_COLORS[task.status]
          )}
        >
          {TASK_STATUS_LABELS[task.status]}
        </span>
      </div>
    )
  }

  // =============================================================================
  // Expanded State
  // =============================================================================

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border">
        {/* Title row */}
        <div
          className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => setIsExpanded(false)}
        >
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {isRunning && (
              <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
            )}
            <span className="text-sm font-medium truncate">
              {task.title || "Processing..."}
            </span>
          </div>
          <span
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-full shrink-0",
              TASK_STATUS_COLORS[task.status]
            )}
          >
            {TASK_STATUS_LABELS[task.status]}
          </span>

          {/* Header actions - only show when not running */}
          {!isRunning && !hasError && (
            <div
              className="flex items-center gap-1.5 ml-2"
              onClick={(e) => e.stopPropagation()}
            >
              {canApply && (
                <Button
                  size="sm"
                  onClick={handleApply}
                  disabled={isApplying}
                  className="h-7 gap-1 text-xs"
                >
                  {isApplying ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                  Apply
                </Button>
              )}

              {canCreatePR && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCreatePR}
                  disabled={isCreatingPR}
                  className="h-7 gap-1 text-xs"
                >
                  {isCreatingPR ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <GitPullRequest className="h-3 w-3" />
                  )}
                  Create PR
                </Button>
              )}

              {task.prUrl && (
                <a
                  href={task.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:underline px-2"
                >
                  <ExternalLink className="h-3 w-3" />
                  View PR
                </a>
              )}

              {task.diffUnified && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCopyDiff}
                  className="h-7 gap-1 text-xs"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Body - Fixed height container */}
      <div className="h-[360px] overflow-hidden">
        {isRunning ? (
          // Running state with progress animation
          <ProgressView task={task} onRefresh={onRefresh} />
        ) : hasError ? (
          // Error state
          <ErrorView task={task} />
        ) : (
          // Completed state - two column layout
          <div className="flex h-full">
            {/* Left column - Summary & Plan */}
            <div className="w-[280px] border-r border-border flex flex-col">
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  {/* Prompt */}
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground mb-1 font-medium">
                      Prompt
                    </p>
                    <p className="text-sm text-foreground">{task.prompt}</p>
                  </div>

                  {/* Plan */}
                  {task.planMarkdown && (
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground mb-1 font-medium">
                        Plan
                      </p>
                      <div className="text-sm text-foreground/80 prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
                        <div className="whitespace-pre-wrap">{task.planMarkdown}</div>
                      </div>
                    </div>
                  )}

                  {/* File list */}
                  {task.changes.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground mb-2 font-medium">
                        Changed Files ({task.changes.length})
                      </p>
                      <div className="space-y-1">
                        {task.changes.map((change) => (
                          <FileListItem
                            key={change.path}
                            change={change}
                            isSelected={selectedFilePath === change.path}
                            isApplied={workspace?.files[change.path] === change.after}
                            onClick={() => setSelectedFilePath(change.path)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Right column - Diff Preview */}
            <div className="flex-1 flex flex-col min-w-0">
              {selectedChange ? (
                <DiffPreview
                  change={selectedChange}
                  isApplied={workspace?.files[selectedChange.path] === selectedChange.after}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                  {task.changes.length === 0
                    ? "No changes generated"
                    : "Select a file to view diff"}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Progress View Component (Running State)
// =============================================================================

function ProgressView({
  task,
  onRefresh,
}: {
  task: CodexTask
  onRefresh: () => Promise<void>
}) {
  const [stageIndex, setStageIndex] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Cycle through progress stages
  useEffect(() => {
    const stage = PROGRESS_STAGES[stageIndex]
    if (!stage) return

    const timer = setTimeout(() => {
      setStageIndex((prev) =>
        prev < PROGRESS_STAGES.length - 1 ? prev + 1 : prev
      )
    }, stage.duration)

    return () => clearTimeout(timer)
  }, [stageIndex])

  // Auto-refresh periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setIsRefreshing(true)
      onRefresh().finally(() => setIsRefreshing(false))
    }, 3000)

    return () => clearInterval(interval)
  }, [onRefresh])

  const currentStage = PROGRESS_STAGES[stageIndex] || PROGRESS_STAGES[PROGRESS_STAGES.length - 1]
  const progress = ((stageIndex + 1) / PROGRESS_STAGES.length) * 100

  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        {/* Spinner and text */}
        <div className="text-center space-y-3">
          <div className="relative">
            <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto" />
            {isRefreshing && (
              <div className="absolute -top-1 -right-1 h-3 w-3 bg-blue-500 rounded-full animate-pulse" />
            )}
          </div>
          <p className="text-sm font-medium text-foreground">{currentStage.text}</p>
          <p className="text-xs text-muted-foreground">
            This usually takes 5-15 seconds
          </p>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Generating code...</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>

        {/* Log preview */}
        {task.logs.length > 0 && (
          <div className="bg-muted/50 rounded-lg p-3 max-h-[120px] overflow-auto">
            <div className="space-y-1 font-mono text-[11px]">
              {task.logs.slice(-5).map((log, idx) => (
                <div key={idx} className="text-muted-foreground">
                  <span className="text-muted-foreground/50 mr-2">•</span>
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Error View Component
// =============================================================================

function ErrorView({ task }: { task: CodexTask }) {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="text-center space-y-4 max-w-md">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
          <AlertCircle className="h-6 w-6 text-red-500" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground mb-2">Task Failed</p>
          <p className="text-sm text-red-600 dark:text-red-400">{task.error}</p>
        </div>
        {task.logs.length > 0 && (
          <div className="bg-muted/50 rounded-lg p-3 text-left max-h-[150px] overflow-auto">
            <div className="space-y-1 font-mono text-[11px]">
              {task.logs.map((log, idx) => (
                <div key={idx} className="text-muted-foreground">
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// File List Item Component
// =============================================================================

function FileListItem({
  change,
  isSelected,
  isApplied,
  onClick,
}: {
  change: CodexFileChange
  isSelected: boolean
  isApplied: boolean
  onClick: () => void
}) {
  const isNew = !change.before

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors",
        isSelected
          ? "bg-primary/10 text-primary"
          : "hover:bg-muted text-foreground/80"
      )}
    >
      <FileCode className="h-3 w-3 shrink-0" />
      <span className="text-xs font-mono truncate flex-1">{change.path}</span>
      <span
        className={cn(
          "text-[9px] px-1 py-0.5 rounded shrink-0",
          isNew
            ? "bg-green-500/20 text-green-600 dark:text-green-400"
            : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
        )}
      >
        {isNew ? "NEW" : "MOD"}
      </span>
      {isApplied && (
        <Check className="h-3 w-3 text-green-500 shrink-0" />
      )}
    </button>
  )
}

// =============================================================================
// Diff Preview Component
// =============================================================================

function DiffPreview({
  change,
  isApplied,
}: {
  change: CodexFileChange
  isApplied: boolean
}) {
  const isNew = !change.before

  // Generate simple diff lines for display
  const diffLines = generateDiffLines(change)

  return (
    <div className="flex flex-col h-full">
      {/* Diff header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border">
        <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-mono flex-1">{change.path}</span>
        <span
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded",
            isNew
              ? "bg-green-500/20 text-green-600 dark:text-green-400"
              : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
          )}
        >
          {isNew ? "NEW FILE" : "MODIFIED"}
        </span>
        {isApplied && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-600 dark:text-green-400">
            APPLIED
          </span>
        )}
      </div>

      {/* Diff content */}
      <ScrollArea className="flex-1">
        <pre className="p-4 text-xs font-mono leading-relaxed">
          {diffLines.map((line, idx) => (
            <div
              key={idx}
              className={cn(
                "whitespace-pre",
                line.type === "add" && "bg-green-500/10 text-green-700 dark:text-green-300",
                line.type === "remove" && "bg-red-500/10 text-red-700 dark:text-red-300",
                line.type === "header" && "text-muted-foreground font-semibold"
              )}
            >
              {line.content}
            </div>
          ))}
        </pre>
      </ScrollArea>
    </div>
  )
}

// =============================================================================
// Helper Functions
// =============================================================================

interface DiffLine {
  type: "add" | "remove" | "context" | "header"
  content: string
}

function generateDiffLines(change: CodexFileChange): DiffLine[] {
  const lines: DiffLine[] = []
  const isNew = !change.before

  // Header
  lines.push({ type: "header", content: `--- a/${change.path}` })
  lines.push({ type: "header", content: `+++ b/${change.path}` })

  if (isNew) {
    // New file - show all lines as additions
    const afterLines = change.after.split("\n")
    lines.push({ type: "header", content: `@@ -0,0 +1,${afterLines.length} @@` })
    afterLines.forEach((line) => {
      lines.push({ type: "add", content: `+${line}` })
    })
  } else {
    // Modified file - generate simplified diff
    const beforeLines = change.before!.split("\n")
    const afterLines = change.after.split("\n")

    lines.push({
      type: "header",
      content: `@@ -1,${beforeLines.length} +1,${afterLines.length} @@`,
    })

    // Simple diff: show removed lines, then added lines
    // In a real implementation, use a proper diff algorithm
    beforeLines.forEach((line) => {
      lines.push({ type: "remove", content: `-${line}` })
    })
    afterLines.forEach((line) => {
      lines.push({ type: "add", content: `+${line}` })
    })
  }

  return lines
}
