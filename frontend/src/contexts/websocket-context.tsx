//const ws = new WebSocket("ws://localhost:8000/ws/moderation");
//ws.onmessage = (event) => console.log(JSON.parse(event.data));

"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect, useCallback } from "react"

export type DebateStatus = "active" | "completed" | "paused"

export interface Debate {
  debate_id: string
  query: string
  status?: DebateStatus
  agents?: string[]
  start_time?: string
  end_time?: string
}

export interface LogEntry {
  id: string
  type: "system" | "response" | "critique" | "result" | "event"
  content?: string
  timestamp: string
  agent?: string
  from?: string
  to?: string
  confidence?: number
  round?: number
  strengths?: number
  weaknesses?: number
  result?: any
  data?: any
}

interface WebSocketContextType {
  isConnected: boolean
  debates: Debate[]
  currentDebate: Debate | null
  debateLog: LogEntry[]
  sendCommand: (command: string, params?: Record<string, any>) => void
  startDebate: (query: string) => void
  viewDebate: (debate: Debate) => void
  sendChatMessage: (message: string) => void
  error: string | null
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined)

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const [debates, setDebates] = useState<Debate[]>([])
  const [currentDebate, setCurrentDebate] = useState<Debate | null>(null)
  const [debateLog, setDebateLog] = useState<LogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ws, setWs] = useState<WebSocket | null>(null)

  const connectWebSocket = useCallback(() => {
      // frontend/src/contexts/websocket-context.tsx
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://websocket-server:8000/ws/moderation";
      console.log("Attempting to connect to WebSocket:", wsUrl);

    try {
      const newWs = new WebSocket(wsUrl);

      newWs.onopen = () => {
        console.log("WebSocket connected successfully")
        setIsConnected(true)
        setError(null)

        // Subscribe to AI Council events
        sendCommand("subscribe", { channel: "ai_council:events" })

        // Get list of active debates
        sendCommand("list_debates", { include_completed: true })
      }

      newWs.onclose = (event) => {
        console.log("WebSocket disconnected:", event)
        setIsConnected(false)
        setError(`WebSocket disconnected: ${event.reason || "Unknown reason"}`)
        // Attempt to reconnect after a delay
        setTimeout(connectWebSocket, 5000)
      }

      newWs.onerror = (error) => {
        console.error("WebSocket error:", error)
        setError(`WebSocket error: ${error.toString()}`)
        setIsConnected(false)
      }

      newWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          handleWebSocketMessage(data)
        } catch (error) {
          console.error("Error parsing WebSocket message:", error)
          setError(`Error parsing WebSocket message: ${error}`)
        }
      }

      setWs(newWs)
    } catch (error) {
      console.error("Error creating WebSocket:", error)
      setError(`Error creating WebSocket: ${error}`)
      setIsConnected(false)
    }
  }, [])

  useEffect(() => {
    connectWebSocket()

    return () => {
      if (ws) {
        ws.close()
      }
    }
  }, [connectWebSocket])

  const sendCommand = useCallback(
    (command: string, params: Record<string, any> = {}) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ command, params }))
      } else {
        setError("WebSocket not connected")
      }
    },
    [ws],
  )

  const sendChatMessage = useCallback((message: string) => {
    sendCommand("chat_message", { content: message });
  }, [sendCommand]);

  const handleWebSocketMessage = useCallback((data: any) => {
    console.log("Received WS message:", data);
    if (data.debates) {
      setDebates(data.debates);
    } else if (data.event === "chat_message") {
      setDebateLog((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          type: "response",
          content: data.content,
          timestamp: data.timestamp || new Date().toISOString(),
          agent: data.agent || "user",
        },
      ]);
    } else if (data.event) {
      // Handle different event types here
      // This is a simplified version, you might want to expand this based on your actual event types
      switch (data.event) {
        case "debate_started":
          setDebates((prev) => [
            ...prev,
            {
              debate_id: data.debate_id,
              query: data.query,
              status: "active",
              agents: data.agents,
              start_time: data.timestamp,
            },
          ])
          break
        case "debate_ended":
          setDebates((prev) =>
            prev.map((d) => (d.debate_id === data.debate_id ? { ...d, status: "completed" as DebateStatus } : d)),
          )
          break
        // Add more cases as needed
      }

      // Add to debate log
      setDebateLog((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          type: "event",
          content: data.event,
          timestamp: data.timestamp || new Date().toISOString(),
          data: data,
        },
      ])
    }
  }, [])

  const startDebate = useCallback(
    (query: string) => {
      if (!query.trim()) {
        setError("Please enter a query")
        return
      }

      setError(null)
      setCurrentDebate(null)
      setDebateLog([])

      sendCommand("start_debate", {
        query: query.trim(),
        agents: ["claude", "gpt4o", "grok"], // Default agents
      })
    },
    [sendCommand],
  )

  const viewDebate = useCallback(
    (debate: Debate) => {
      setCurrentDebate(debate)
      setDebateLog([])

      sendCommand("subscribe", { channel: `debate:${debate.debate_id}` })
      sendCommand("get_debate", { debate_id: debate.debate_id })

      setDebateLog((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          type: "system",
          content: `Viewing debate: "${debate.query}"`,
          timestamp: new Date().toISOString(),
        },
      ])
    },
    [sendCommand],
  )

  const value = {
    isConnected,
    debates,
    currentDebate,
    debateLog,
    sendCommand,
    startDebate,
    viewDebate,
    sendChatMessage,
    error
  }

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>
}

export function useWebSocket() {
  const context = useContext(WebSocketContext)
  if (context === undefined) {
    throw new Error("useWebSocket must be used within a WebSocketProvider")
  }
  return context
}

