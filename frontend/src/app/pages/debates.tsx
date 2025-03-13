// pages/debates.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

// Define types
type DebateStatus = 'active' | 'completed' | 'paused';

interface Debate {
  debate_id: string;
  query: string;
  status?: DebateStatus;
  agents?: string[];
  start_time?: string;
  end_time?: string;
}

interface LogEntry {
  id: string;
  type: 'system' | 'response' | 'critique' | 'result' | 'event';
  content?: string;
  timestamp: string;
  agent?: string;
  from?: string;
  to?: string;
  confidence?: number;
  round?: number;
  strengths?: number;
  weaknesses?: number;
  result?: any;
  data?: any;
}

interface WebSocketMessage {
  status?: string;
  message?: string;
  debates?: Debate[];
  event?: string;
  debate_id?: string;
  query?: string;
  agents?: string[];
  round_num?: number;
  agent_id?: string;
  response_summary?: string;
  confidence?: number;
  from_agent?: string;
  to_agent?: string;
  strengths_count?: number;
  weaknesses_count?: number;
  result?: any;
  timestamp?: string;
  channel?: string;
  connection_id?: string;
  count?: number;
  debate?: any;
}

// UI Components
interface CardProps {
  children: React.ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '' }) => (
  <div className={`bg-white shadow-md rounded-lg p-6 ${className}`}>
    {children}
  </div>
);

interface BadgeProps {
  children: React.ReactNode;
  type?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
}

const Badge: React.FC<BadgeProps> = ({ children, type = 'default' }) => {
  const colors = {
    default: 'bg-gray-100 text-gray-800',
    primary: 'bg-blue-100 text-blue-800',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    danger: 'bg-red-100 text-red-800',
    info: 'bg-indigo-100 text-indigo-800',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[type]}`}>
      {children}
    </span>
  );
};

interface ButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  type?: 'primary' | 'secondary' | 'success' | 'danger';
  disabled?: boolean;
  className?: string;
}

const Button: React.FC<ButtonProps> = ({ children, onClick, type = 'primary', disabled = false, className = '' }) => {
  const colors = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800',
    success: 'bg-green-600 hover:bg-green-700 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${colors[type]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {children}
    </button>
  );
};

// Main Debate UI Component
const AICouncilDebate: React.FC = () => {
  const router = useRouter();
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [debates, setDebates] = useState<Debate[]>([]);
  const [currentDebate, setCurrentDebate] = useState<Debate | null>(null);
  const [debateLog, setDebateLog] = useState<LogEntry[]>([]);
  const [query, setQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  // Connect to WebSocket and setup event handlers
  useEffect(() => {
    // Close any existing connection
    if (ws.current) {
      ws.current.close();
    }

    // Create new WebSocket connection
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws/council';
    ws.current = new WebSocket(wsUrl);

    // Setup event handlers
    ws.current.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      
      // Subscribe to AI Council events
      sendCommand('subscribe', { channel: 'ai_council:events' });
      
      // Get list of active debates
      sendCommand('list_debates', { include_completed: true });
    };

    ws.current.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('Failed to connect to server');
      setIsConnected(false);
    };

    ws.current.onmessage = (event: MessageEvent) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    // Cleanup on unmount
    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [debateLog]);

  // Helper to send WebSocket commands
  const sendCommand = (command: string, params: Record<string, any> = {}) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ command, params }));
    } else {
      setError('WebSocket not connected');
    }
  };

  // Handle incoming WebSocket messages
  const handleWebSocketMessage = (data: WebSocketMessage) => {
    console.log('Received WS message:', data);

    // Handle response to list_debates command
    if (data.debates) {
      setDebates(data.debates);
      return;
    }

    // Handle debate events
    if (data.event) {
      switch (data.event) {
        case 'connection_established':
          console.log('Connection established:', data.connection_id);
          break;

        case 'debate_started':
          // Add to debates list if not already there
          setDebates(prev => {
            if (!prev.find(d => d.debate_id === data.debate_id)) {
              return [...prev, {
                debate_id: data.debate_id!,
                query: data.query!,
                status: 'active',
                agents: data.agents,
                start_time: data.timestamp
              }];
            }
            return prev;
          });

          // If we're not already viewing a debate, set this as current
          if (!currentDebate && data.debate_id) {
            setCurrentDebate({
              debate_id: data.debate_id,
              query: data.query!
            });
            
            // Subscribe to this debate's channel
            sendCommand('subscribe', { channel: `debate:${data.debate_id}` });
            
            // Get debate details
            sendCommand('get_debate', { debate_id: data.debate_id });
          }
          
          // Add to log
          addToDebateLog({
            type: 'system',
            content: `New debate started: "${data.query}"`,
            timestamp: data.timestamp!
          });
          break;

        case 'debate_round_started':
        case 'round_started':
          addToDebateLog({
            type: 'system',
            content: `Round ${data.round_num} started`,
            timestamp: data.timestamp!
          });
          break;

        case 'agent_response':
          addToDebateLog({
            type: 'response',
            agent: data.agent_id,
            content: data.response_summary,
            confidence: data.confidence,
            round: data.round_num,
            timestamp: data.timestamp!
          });
          break;

        case 'agent_critique':
          addToDebateLog({
            type: 'critique',
            from: data.from_agent,
            to: data.to_agent,
            strengths: data.strengths_count,
            weaknesses: data.weaknesses_count,
            round: data.round_num,
            timestamp: data.timestamp!
          });
          break;

        case 'debate_result':
          addToDebateLog({
            type: 'result',
            content: `Debate completed with status: ${data.result.status}`,
            result: data.result,
            timestamp: data.timestamp!
          });
          
          // Update debates list
          setDebates(prev => 
            prev.map(d => 
              d.debate_id === data.debate_id
                ? { ...d, status: 'completed' as DebateStatus }
                : d
            )
          );
          break;

        default:
          // Add other events to log if they're related to the current debate
          if (data.debate_id && currentDebate && data.debate_id === currentDebate.debate_id) {
            addToDebateLog({
              type: 'event',
              content: `Event: ${data.event}`,
              data: data,
              timestamp: data.timestamp!
            });
          }
      }
    }
  };

  // Add entry to debate log
  const addToDebateLog = (entry: Partial<LogEntry>) => {
    setDebateLog(prev => [...prev, {
      id: Date.now() + Math.random().toString(36).substring(2, 9),
      timestamp: entry.timestamp || new Date().toISOString(),
      ...entry
    } as LogEntry]);
  };

  // Handle submitting a new query
  const handleSubmitQuery = () => {
    if (!query.trim()) {
      setError('Please enter a query');
      return;
    }

    setLoading(true);
    setError(null);

    // Clear current debate and log
    setCurrentDebate(null);
    setDebateLog([]);

    // Submit query to start a new debate
    sendCommand('start_debate', {
      query: query.trim(),
      agents: ['claude', 'gpt4o', 'grok'] // Default agents
    });

    setLoading(false);
  };

  // View a specific debate
  const viewDebate = (debate: Debate) => {
    setCurrentDebate(debate);
    setDebateLog([]); // Clear existing log
    
    // Subscribe to this debate's channel
    sendCommand('subscribe', { channel: `debate:${debate.debate_id}` });
    
    // Get debate details
    sendCommand('get_debate', { debate_id: debate.debate_id });
    
    // Add initial log entry
    addToDebateLog({
      type: 'system',
      content: `Viewing debate: "${debate.query}"`,
      timestamp: new Date().toISOString()
    });
  };

  // Format timestamp 
  const formatTime = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString();
    } catch (e) {
      return 'Invalid time';
    }
  };

  // Render log entry
  const renderLogEntry = (entry: LogEntry) => {
    switch (entry.type) {
      case 'system':
        return (
          <div className="py-1 text-gray-500 text-sm italic">
            {entry.content}
          </div>
        );
      
      case 'response':
        return (
          <div className="py-2 border-l-4 pl-3 my-1" style={{ borderColor: getAgentColor(entry.agent) }}>
            <div className="flex items-center">
              <Badge type={getAgentBadgeType(entry.agent)}>{entry.agent}</Badge>
              <span className="ml-2 text-xs text-gray-500">
                Round {entry.round} • Confidence: {(entry.confidence! * 100).toFixed(1)}%
              </span>
            </div>
            <div className="mt-1">{entry.content}</div>
          </div>
        );
      
      case 'critique':
        return (
          <div className="py-2 border-l-4 border-amber-400 pl-3 my-1">
            <div className="flex items-center">
              <Badge type={getAgentBadgeType(entry.from)}>
                {entry.from}
              </Badge>
              <span className="mx-1">→</span>
              <Badge type={getAgentBadgeType(entry.to)}>
                {entry.to}
              </Badge>
              <span className="ml-2 text-xs text-gray-500">
                Round {entry.round}
              </span>
            </div>
            <div className="mt-1 text-sm">
              Critique: {entry.strengths} strengths, {entry.weaknesses} areas for improvement
            </div>
          </div>
        );
      
      case 'result':
        return (
          <div className="py-2 border-l-4 border-green-600 pl-3 my-1">
            <div className="font-medium">Final Result</div>
            <div>{entry.content}</div>
            {entry.result && (
              <div className="mt-2">
                <Badge type="success">{entry.result.status}</Badge>
                {entry.result.confidence && (
                  <span className="ml-2 text-sm">
                    Confidence: {(entry.result.confidence * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            )}
          </div>
        );
      
      default:
        return (
          <div className="py-1 text-sm">
            {entry.content || JSON.stringify(entry)}
          </div>
        );
    }
  };

  // Get color for agent
  const getAgentColor = (agent?: string): string => {
    switch (agent?.toLowerCase()) {
      case 'claude':
        return '#6366F1'; // Indigo
      case 'gpt4o':
        return '#10B981'; // Emerald
      case 'grok':
        return '#EC4899'; // Pink
      default:
        return '#6B7280'; // Gray
    }
  };

  // Get badge type for agent
  const getAgentBadgeType = (agent?: string): BadgeProps['type'] => {
    switch (agent?.toLowerCase()) {
      case 'claude':
        return 'info';
      case 'gpt4o':
        return 'success';
      case 'grok':
        return 'danger';
      default:
        return 'default';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>AI Council Debate Interface</title>
      </Head>

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">AI Council Debate Interface</h1>

        {/* Connection Status */}
        <div className="mb-6">
          <Badge type={isConnected ? 'success' : 'danger'}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
          {error && (
            <div className="mt-2 text-red-600 text-sm">{error}</div>
          )}
        </div>

        {/* Input Form */}
        <Card className="mb-6">
          <h2 className="text-xl font-bold mb-4">Start a New Debate</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter a question or topic for the AI Council to debate..."
              className="flex-grow px-4 py-2 border rounded-md"
            />
            <Button 
              onClick={handleSubmitQuery} 
              disabled={loading || !query.trim() || !isConnected}
            >
              Start Debate
            </Button>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Debates List */}
          <div className="lg:col-span-1">
            <Card className="h-full">
              <h2 className="text-xl font-bold mb-4">Debates</h2>
              {debates.length === 0 ? (
                <div className="text-gray-500">No debates yet</div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {debates.map((debate) => (
                    <div 
                      key={debate.debate_id}
                      className={`p-3 rounded-md cursor-pointer transition-colors duration-200 ${
                        currentDebate?.debate_id === debate.debate_id
                          ? 'bg-blue-100 border border-blue-300'
                          : 'hover:bg-gray-100 border border-gray-200'
                      }`}
                      onClick={() => viewDebate(debate)}
                    >
                      <div className="font-medium truncate">{debate.query}</div>
                      <div className="flex items-center justify-between mt-2">
                        <Badge type={debate.status === 'completed' ? 'success' : 'primary'}>
                          {debate.status || 'active'}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {debate.start_time ? new Date(debate.start_time).toLocaleTimeString() : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Debate Log */}
          <div className="lg:col-span-3">
            <Card>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">
                  {currentDebate ? `Debate: ${currentDebate.query}` : 'No Active Debate'}
                </h2>
                {currentDebate && (
                  <Badge type="primary">
                    ID: {currentDebate.debate_id.substring(0, 8)}...
                  </Badge>
                )}
              </div>

              <div 
                ref={logContainerRef}
                className="bg-gray-50 rounded-md p-4 h-96 overflow-y-auto border border-gray-200"
              >
                {debateLog.length === 0 ? (
                  <div className="text-gray-500 text-center py-4">
                    {currentDebate 
                      ? 'Waiting for debate activity...' 
                      : 'Select a debate or start a new one'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {debateLog.map((entry) => (
                      <div key={entry.id} className="flex">
                        <div className="text-xs text-gray-500 mr-2 shrink-0 w-14">
                          {formatTime(entry.timestamp)}
                        </div>
                        <div className="flex-grow">
                          {renderLogEntry(entry)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AICouncilDebate;