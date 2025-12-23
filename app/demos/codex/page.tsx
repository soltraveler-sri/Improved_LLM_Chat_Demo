import { Terminal, Sparkles } from "lucide-react"

export default function CodexDemo() {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Terminal className="h-5 w-5" />
          Codex Integration Demo
        </div>
        <p className="text-sm text-muted-foreground">
          Code generation and execution powered by structured outputs.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Sparkles className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Coming Soon</h2>
        <p className="text-muted-foreground max-w-sm">
          This demo will showcase code generation, syntax highlighting,
          and safe execution sandboxing.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="p-4 rounded-lg border border-border bg-card">
          <h3 className="font-medium mb-2">Planned Features</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>- Multi-language code generation</li>
            <li>- Live preview / execution</li>
            <li>- Diff view for code changes</li>
            <li>- Project context awareness</li>
          </ul>
        </div>
        <div className="p-4 rounded-lg border border-border bg-card">
          <h3 className="font-medium mb-2">Safety Features</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>- Sandboxed execution</li>
            <li>- Resource limits</li>
            <li>- Code review before run</li>
            <li>- Rollback capabilities</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
