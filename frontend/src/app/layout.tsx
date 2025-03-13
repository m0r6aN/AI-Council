import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"

import { ThemeProvider } from "@/components/theme-provider"
import { WebSocketProvider } from "@/contexts/websocket-context"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Toaster } from "@/components/ui/toaster"

import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: {
    default: "AI Council Dashboard",
    template: "%s | AI Council Dashboard",
  },
  description: "Real-time monitoring and control interface for AI agent debates",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <WebSocketProvider>
            <DashboardLayout>{children}</DashboardLayout>
            <Toaster />
          </WebSocketProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

