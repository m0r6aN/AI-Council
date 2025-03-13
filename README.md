# AI Council Dashboard

![AI Council Dashboard]

## Overview

The AI Council Dashboard is a real-time monitoring and control interface for observing structured debates between multiple AI agents. This cutting-edge system allows operators to witness collaborative AI reasoning in action, with a focus on transparency, iteration, and quality decision-making.

## Features

### Real-Time Debate Streaming

The dashboard provides a live window into AI deliberations:

- **Color-Coded Agent Responses** - Each AI agent (Claude, GPT-4o, Grok) has a distinct visual identity, making it easy to track which model is contributing at any moment
- **Confidence Visualization** - See exactly how confident each agent is in their responses with precise percentage indicators
- **Round-by-Round Progression** - Watch as debates unfold through structured phases, from initial responses to critique, refinement, and conclusion
- **Critique Exchange** - Observe how AI agents analyze and critique each other's reasoning, identifying strengths and weaknesses

### Debate Control Hub

Operators have full control over debate sessions:

- **Query Submission** - Start new debates on any topic with a simple submission form
- **Active Debate Management** - View all active debates and easily switch between them
- **Debate History** - Access completed debates to review outcomes and reasoning processes
- **WebSocket Connection Status** - Clear indicators show system connectivity at all times

### Structured Deliberation Visibility

The system makes visible the normally hidden process of AI deliberation:

- **Arbitration Monitoring** - See how the system resolves disagreements between agents
- **Consensus Formation** - Watch as agents modify their positions and converge toward agreement
- **Dissent Tracking** - When agents maintain different viewpoints, see both majority and minority positions
- **Decision Confidence** - Clear metrics show overall confidence in final decisions

## User Interface

### Main Components

1. **Connection Status Panel**
   - WebSocket connection indicator
   - Error reporting and status messages

2. **Query Submission Form**
   - Text input for new debate topics
   - Start button to trigger new AI Council sessions

3. **Debates Sidebar**
   - List of active and completed debates
   - Status indicators showing debate progress
   - Timestamp information
   - Selection mechanism for viewing specific debates

4. **Debate Log Viewer**
   - Real-time activity stream showing all debate interactions
   - Color-coded messages for different agents and event types
   - Timestamp display for precise timing information
   - Auto-scrolling with newest messages
   - Formatted display of different message types:
     - System notifications
     - Agent responses with confidence scores
     - Inter-agent critiques
     - Final results with dissenting views

### Visual Design

The interface employs a clean, information-dense design with careful use of color to differentiate information types:

- **Claude:** Indigo theme (#6366F1)
- **GPT-4o:** Emerald theme (#10B981)
- **Grok:** Pink theme (#EC4899)
- **System Events:** Gray theme (#6B7280)
- **Critiques:** Amber accents
- **Final Results:** Green accents

Badges, cards, and structured layouts create clear visual hierarchies, ensuring that even complex debate information remains accessible and scannable.

## Technical Implementation

The UI is built with:
- **Next.js & React** - Core framework for component-based UI
- **TypeScript** - Strong typing for code reliability
- **Tailwind CSS** - Utility-first styling approach
- **WebSocket API** - Real-time communication with backend

## Getting Started

1. Ensure the AI Council backend is running at `localhost:8000` (or configure the `NEXT_PUBLIC_WS_URL` environment variable)
2. Install dependencies: `npm install`
3. Start the development server: `npm run dev`
4. Navigate to `http://localhost:3000/debates`

## Command API

The WebSocket interface supports the following commands:

- `subscribe` - Subscribe to specific debate channels
- `unsubscribe` - Unsubscribe from channels
- `list_debates` - Get all active and optional completed debates
- `get_debate` - Get detailed information about a specific debate
- `start_debate` - Begin a new AI Council debate session
- `submit_query` - Submit a query to an existing debate session

## Example Usage Scenario

1. Operator submits the query: "What is the most ethical approach to the trolley problem?"
2. The debate list updates showing the new active debate
3. The debate log begins populating with initial responses from each AI agent
4. Operators observe as agents critique each other's ethical reasoning
5. The system tracks how agent positions evolve through refinement rounds
6. The final arbitration selects the strongest response while noting dissenting views
7. The detailed log provides insight into how the AI Council reached its conclusion

The AI Council Dashboard offers unprecedented visibility into collaborative AI reasoning, helping operators understand not just what AI systems conclude, but how they arrive at their conclusions through structured deliberation.