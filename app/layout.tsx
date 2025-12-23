import type { Metadata } from "next"
import { ThemeProvider } from "@/components/theme-provider"
import { Nav } from "@/components/nav"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

export const metadata: Metadata = {
  title: "LLM Chat Demos",
  description: "Product improvements to LLM chat interfaces",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="app-background noise-overlay min-h-screen">
            <div className="relative z-10 min-h-screen flex flex-col">
              <div className="mx-auto w-full max-w-5xl px-4 py-6 flex-1 flex flex-col">
                <div className="app-frame flex-1 flex flex-col overflow-hidden">
                  <Nav />
                  <main className="flex-1 overflow-auto">
                    {children}
                  </main>
                </div>
              </div>
            </div>
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
