"use client"

import type React from "react"

import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react"

// Define types
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

export interface WebSocketMessage {
  status?: string
  message?: string
  debates?: Debate[]
  event?: string
  debate_id?: string
  query?: string
  agents?: string[]
  round_num?: number
  agent_id?: string
  response_summary?: string
  confidence?: number
  from_agent?: string
  to_agent?: string
  strengths_count?: number
  weaknesses_count?: number
  result?: any
  timestamp?: string
  channel?: string
  connection_id?: string
  count?: number
  debate?: any
}

interface WebSocketContextType {
  isConnected: boolean
  debates: Debate[]
  currentDebate: Debate | null
  debateLog: LogEntry[]
  sendCommand: (command: string, params?: Record<string, any>) => void
  startDebate: (query: string) => void
  viewDebate: (debate: Debate) => void
  error: string | null
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined)

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const [debates, setDebates] = useState<Debate[]>([])
  const [currentDebate, setCurrentDebate] = useState<Debate | null>(null)
  const [debateLog, setDebateLog] = useState<LogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const ws = useRef<WebSocket | null>(null)

  // Connect to WebSocket
  useEffect(() => {
    // Close any existing connection
    if (ws.current) {
      ws.current.close()
    }

    // Create new WebSocket connection
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/council"
    ws.current = new WebSocket(wsUrl)

    // Setup event handlers
    ws.current.onopen = () => {
      console.log("WebSocket connected")
      setIsConnected(true)

      // Subscribe to AI Council events
      sendCommand("subscribe", { channel: "ai_council:events" })

      // Get list of active debates
      sendCommand("list_debates", { include_completed: true })
    }

    ws.current.onclose = () => {
      console.log("WebSocket disconnected")
      setIsConnected(false)
    }

    ws.current.onerror = (error) => {
      console.error("WebSocket error:", error)
      setError("Failed to connect to server")
      setIsConnected(false)
    }

    ws.current.onmessage = (event: MessageEvent) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data)
        handleWebSocketMessage(data)
      } catch (error) {
        console.error("Error parsing WebSocket message:", error)
      }
    }

    // Cleanup on unmount
    return () => {
      if (ws.current) {
        ws.current.close()
      }
    }
  }, [])

  // Helper to send WebSocket commands
  const sendCommand = useCallback((command: string, params: Record<string, any> = {}) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ command, params }))
    } else {
      setError("WebSocket not connected")
    }
  }, [])

  // Add entry to debate log
  const addToDebateLog = useCallback((entry: Partial<LogEntry>) => {
    setDebateLog((prev) => [
      ...prev,
      {
        id: Date.now() + Math.random().toString(36).substring(2, 9),
        timestamp: entry.timestamp || new Date().toISOString(),
        ...entry,
      } as LogEntry,
    ])
  }, [])

  // Handle incoming WebSocket messages
  const handleWebSocketMessage = useCallback(
    (data: WebSocketMessage) => {
      console.log("Received WS message:", data)

      // Handle response to list_debates command
      if (data.debates) {
        setDebates(data.debates)
        return
      }

      // Handle debate events
      if (data.event) {
        switch (data.event) {
          case "connection_established":
            console.log("Connection established:", data.connection_id)
            break

          case "debate_started":
            // Add to debates list if not already there
            setDebates((prev) => {
              if (!prev.find((d) => d.debate_id === data.debate_id)) {
                return [
                  ...prev,
                  {
                    debate_id: data.debate_id!,
                    query: data.query!,
                    status: "active",
                    agents: data.agents,
                    start_time: data.timestamp,
                  },
                ]
              }
              return prev
            })

            // If we're not already viewing a debate, set this as current
            if (!currentDebate && data.debate_id) {
              setCurrentDebate({
                debate_id: data.debate_id,
                query: data.query!,
              })

              // Subscribe to this debate's channel
              sendCommand("subscribe", { channel: `debate:${data.debate_id}` })

              // Get debate details
              sendCommand("get_debate", { debate_id: data.debate_id })
            }

            // Add to log
            addToDebateLog({
              type: "system",
              content: `New debate started: "${data.query}"`,
              timestamp: data.timestamp!,
            })
            break

          case "debate_round_started":
          case "round_started":
            addToDebateLog({
              type: "system",
              content: `Round ${data.round_num} started`,
              timestamp: data.timestamp!,
            })
            break

          case "agent_response":
            addToDebateLog({
              type: "response",
              agent: data.agent_id,
              content: data.response_summary,
              confidence: data.confidence,
              round: data.round_num,
              timestamp: data.timestamp!,
            })
            break

          case "agent_critique":
            addToDebateLog({
              type: "critique",
              from: data.from_agent,
              to: data.to_agent,
              strengths: data.strengths_count,
              weaknesses: data.weaknesses_count,
              round: data.round_num,
              timestamp: data.timestamp!,
            })
            break

          case "debate_result":
            addToDebateLog({
              type: "result",
              content: `Debate completed with status: ${data.result.status}`,
              result: data.result,
              timestamp: data.timestamp!,
            })

            // Update debates list
            setDebates((prev) =>
              prev.map((d) => (d.debate_id === data.debate_id ? { ...d, status: "completed" as DebateStatus } : d)),
            )
            break

          default:
            // Add other events to log if they're related to the current debate
            if (data.debate_id && currentDebate && data.debate_id === currentDebate.debate_id) {
              addToDebateLog({
                type: "event",
                content: `Event: ${data.event}`,
                data: data,
                timestamp: data.timestamp!,
              })
            }
        }
      }
    },
    [currentDebate, sendCommand, addToDebateLog],
  )

  // Handle submitting a new query
  const startDebate = useCallback(
    (query: string) => {
      if (!query.trim()) {
        setError("Please enter a query")
        return
      }

      setError(null)

      // Clear current debate and log
      setCurrentDebate(null)
      setDebateLog([])

      // Submit query to start a new debate
      sendCommand("start_debate", {
        query: query.trim(),
        agents: ["claude", "gpt4o", "grok"], // Default agents
      })
    },
    [sendCommand],
  )

  // View a specific debate
  const viewDebate = useCallback(
    (debate: Debate) => {
      setCurrentDebate(debate)
      setDebateLog([]) // Clear existing log

      // Subscribe to this debate's channel
      sendCommand("subscribe", { channel: `debate:${debate.debate_id}` })

      // Get debate details
      sendCommand("get_debate", { debate_id: debate.debate_id })

      // Add initial log entry
      addToDebateLog({
        type: "system",
        content: `Viewing debate: "${debate.query}"`,
        timestamp: new Date().toISOString(),
      })
    },
    [sendCommand, addToDebateLog],
  )

  const value = {
    isConnected,
    debates,
    currentDebate,
    debateLog,
    sendCommand,
    startDebate,
    viewDebate,
    error,
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

