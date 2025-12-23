import { History, Clock } from "lucide-react"

export default function HistoryDemo() {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <History className="h-5 w-5" />
          Conversation History Demo
        </div>
        <p className="text-sm text-muted-foreground">
          Browse and search through past conversations with semantic search.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Clock className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Coming Soon</h2>
        <p className="text-muted-foreground max-w-sm">
          This demo will showcase conversation history management with search,
          filtering, and quick navigation features.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="p-4 rounded-lg border border-border bg-card">
          <h3 className="font-medium mb-2">Planned Features</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>- Semantic search across conversations</li>
            <li>- Date-based filtering</li>
            <li>- Conversation summaries</li>
            <li>- Quick resume from any point</li>
          </ul>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card">
          <h3 className="font-medium mb-2">Design Goals</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>- Fast, keyboard-driven navigation</li>
            <li>- Visual timeline view</li>
            <li>- Export capabilities</li>
            <li>- Cross-session continuity</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
