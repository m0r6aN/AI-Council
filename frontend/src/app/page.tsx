import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "AI Council Dashboard",
  description: "Real-time monitoring and control interface for AI agent debates",
}

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] py-12 px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">AI Council Dashboard</h1>
      <p className="mt-6 text-xl text-muted-foreground max-w-3xl">
        A real-time monitoring and control interface for observing structured debates between multiple AI agents.
      </p>
      <div className="mt-10 flex flex-col sm:flex-row gap-4">
        <Button asChild size="lg">
          <Link href="/debates">
            View Debates <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/about">Learn More</Link>
        </Button>
      </div>
    </div>
  )
}

