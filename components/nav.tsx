"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { GitBranch, History, Terminal, Sun, Moon } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navItems = [
  {
    href: "/demos/branches",
    label: "Branches",
    icon: GitBranch,
  },
  {
    href: "/demos/history",
    label: "History",
    icon: History,
  },
  {
    href: "/demos/codex",
    label: "Codex",
    icon: Terminal,
  },
]

export function Nav() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()

  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b border-border/50">
      <div className="flex items-center gap-1">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight mr-6 hover:text-muted-foreground transition-colors"
        >
          LLM Chat Demos
        </Link>
        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "gap-2",
                    isActive && "bg-secondary"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Button>
              </Link>
            )
          })}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="h-8 w-8"
      >
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    </nav>
  )
}
