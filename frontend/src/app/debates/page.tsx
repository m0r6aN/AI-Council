"use client";

import { LogEntry, useWebSocket } from "@/contexts/websocket-context";
import { Badge, Button, Card, badgeVariants } from "@/components/ui";
import { JSX, useEffect, useRef, useState } from "react";

export default function DebatesPage() {
  const {
    isConnected,
    debates,
    currentDebate,
    debateLog,
    startDebate,
    viewDebate,
    error,
  } = useWebSocket();
  const [query, setQuery] = useState("");
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [debateLog]);

  const handleSubmitQuery = () => {
    if (query.trim()) startDebate(query);
    setQuery("");
  };

  const renderLogEntry = (entry: LogEntry): JSX.Element => {
    switch (entry.type) {
      case "system":
        return (
          <div className="text-muted-foreground text-sm italic">
            {entry.content}
          </div>
        );

      case "response":
        return (
          <div
            className="py-2 border-l-4 pl-3 my-1"
            style={{ borderColor: getAgentColor(entry.agent) }}
          >
            <div className="flex items-center">
              <Badge variant={getAgentBadgeType(entry.agent)}>
                {entry.agent}
              </Badge>
              <span className="ml-2 text-xs text-muted-foreground">
                Round {entry.round} • Confidence:{" "}
                {entry.confidence ? (entry.confidence * 100).toFixed(1) : "N/A"}
                %
              </span>
            </div>
            <div className="mt-1">{entry.content}</div>
          </div>
        );

      case "critique":
        return (
          <div className="py-2 border-l-4 border-amber-400 pl-3 my-1">
            <div className="flex items-center">
              <Badge variant={getAgentBadgeType(entry.from)}>
                {entry.from}
              </Badge>
              <span className="mx-1">→</span>
              <Badge variant={getAgentBadgeType(entry.to)}>{entry.to}</Badge>
              <span className="ml-2 text-xs text-muted-foreground">
                Round {entry.round}
              </span>
            </div>
            <div className="mt-1 text-sm">
              Critique: {entry.strengths} strengths, {entry.weaknesses} areas
              for improvement
            </div>
          </div>
        );

      case "result":
        return (
          <div className="py-2 border-l-4 border-green-600 pl-3 my-1">
            <div className="font-medium">Final Result</div>
            <div>{entry.content}</div>
            {entry.result && (
              <div className="mt-2">
                <Badge variant="default">{entry.result.status}</Badge>
              </div>
            )}
          </div>
        );

      case "event":
        return (
          <div className="py-1 text-sm">
            {entry.content || JSON.stringify(entry.data)}
          </div>
        );

      default:
        // TypeScript will warn if we miss a case thanks to LogEntry's union type
        return <div>{entry.content || "Unknown log entry"}</div>;
    }
  };

  // Helper functions (typed too!)
  const getAgentColor = (agent?: string): string => {
    switch (agent?.toLowerCase()) {
      case "claude":
        return "#6366F1"; // Indigo
      case "gpt4o":
        return "#10B981"; // Emerald
      case "grok":
        return "#EC4899"; // Pink
      default:
        return "#6B7280"; // Gray
    }
  };

  const getAgentBadgeType = (agent?: string): "default" | "secondary" | "destructive" | "outline" | "success" => {
    switch (agent?.toLowerCase()) {
      case "claude": return "outline";
      case "gpt": return "success"; // Back to "success" now that we have it!
      case "grok": return "destructive";
      default: return "default";
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">AI Council Debates</h1>
      <Badge variant={isConnected ? "default" : "destructive"}>
        {isConnected ? "Connected" : "Disconnected"}
      </Badge>
      {error && <div className="text-red-500 mt-2">{error}</div>}

      <Card className="mb-6">
        <h2 className="text-xl font-bold mb-4">Start a New Debate</h2>
        <div className="flex gap-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter a debate topic..."
            className="flex-grow border rounded-md px-4 py-2"
          />
          <Button
            onClick={handleSubmitQuery}
            disabled={!isConnected || !query.trim()}
          >
            Start Debate
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1">
          <h2 className="text-xl font-bold mb-4">Debates</h2>
          {debates.map((debate) => (
            <div
              key={debate.debate_id}
              className={`p-3 rounded-md cursor-pointer ${
                currentDebate?.debate_id === debate.debate_id
                  ? "bg-accent"
                  : "hover:bg-muted"
              }`}
              onClick={() => viewDebate(debate)}
            >
              <div className="font-medium truncate">{debate.query}</div>
              <Badge variant={debate.status === "completed" ? "outline" : "destructive"}>
                {debate.status || "active"}
              </Badge>
            </div>
          ))}
        </Card>

        <Card className="lg:col-span-3">
          <h2 className="text-xl font-bold mb-4">
            {currentDebate
              ? `Debate: ${currentDebate.query}`
              : "No Active Debate"}
          </h2>
          <div
            ref={logContainerRef}
            className="bg-muted rounded-md p-4 h-96 overflow-y-auto"
          >
            {debateLog.map((entry) => (
              <div key={entry.id} className="flex">
                <div className="text-xs text-muted-foreground mr-2 w-14">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </div>
                <div className="flex-grow">{renderLogEntry(entry)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
