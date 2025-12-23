"use client"

import { useState } from "react"
import { GitBranch, Send, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function BranchesDemo() {
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<{
    id: string
    output_text: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePing = async () => {
    if (!input.trim()) return

    setLoading(true)
    setError(null)
    setResponse(null)

    try {
      const res = await fetch("/api/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Something went wrong")
      } else {
        setResponse(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <GitBranch className="h-5 w-5" />
          Branch Overlay Demo
        </div>
        <p className="text-sm text-muted-foreground">
          Explore conversation branches with an intuitive overlay interface.
          Chat UI coming in the next PR.
        </p>
      </div>

      <div className="border border-border rounded-lg p-6 bg-muted/30">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">API Smoke Test</label>
            <p className="text-xs text-muted-foreground">
              Test the OpenAI Responses API connection. Enter a message and hit send.
            </p>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Enter a test message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && handlePing()}
              disabled={loading}
              className="flex-1"
            />
            <Button
              onClick={handlePing}
              disabled={loading || !input.trim()}
              size="icon"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {error && (
            <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {error}
            </div>
          )}

          {response && (
            <div className="space-y-3">
              <div className="p-4 rounded-md bg-background border border-border">
                <p className="text-sm whitespace-pre-wrap">{response.output_text}</p>
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                Response ID: {response.id}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="p-4 rounded-lg border border-border bg-card">
          <h3 className="font-medium mb-2">Features Coming</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>- Visual branch tree overlay</li>
            <li>- Click to explore alternate responses</li>
            <li>- Branch comparison view</li>
            <li>- Response regeneration</li>
          </ul>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card">
          <h3 className="font-medium mb-2">Tech Stack</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>- OpenAI Responses API</li>
            <li>- previous_response_id chaining</li>
            <li>- Reasoning effort control</li>
            <li>- Response storage</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
