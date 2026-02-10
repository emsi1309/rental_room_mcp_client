# Hostel AI Agent

AI-powered chatbot agent for Hostel Management System using Ollama LLM and MCP Server tools.

## Setup

```bash
npm install
```

## Prerequisites

- **Ollama** installed and running locally
- **MCP Server** running on `http://localhost:3001`
- **Backend API** running on `http://localhost:8080/api`

### Installing Ollama

1. Download from [ollama.ai](https://ollama.ai)
2. Run a model: `ollama run mistral` (or `llama2`, `neural-chat`, etc.)
3. Ollama will be available at `http://localhost:11434`

## Environment Variables

Create `.env` file:

```
OLLAMA_API_URL=http://localhost:11434/api
OLLAMA_MODEL=mistral
MCP_SERVER_URL=http://localhost:3001
BACKEND_API_URL=http://localhost:8080/api
AGENT_PORT=3002
LOG_LEVEL=info
```

## Running

```bash
# Development
npm run dev

# Production
npm start
```

## Architecture

- `src/index.js` - Express server entry point
- `src/config.js` - Configuration
- `src/agent/` - AI Agent implementation
  - `agent.js` - Main agent logic
  - `ollama-client.js` - Ollama LLM integration
  - `tool-executor.js` - MCP tool executor
- `src/routes/` - API routes
  - `chat.js` - Chat endpoint
- `src/utils/` - Utilities
  - `logger.js` - Logging
  - `prompt.js` - Prompt templates

## API Endpoints

### POST /api/chat
Send a message to the AI agent

**Request:**
```json
{
  "message": "How many available rooms do we have in house 1?",
  "userId": "user-id",
  "sessionId": "optional-session-id"
}
```

**Response:**
```json
{
  "success": true,
  "response": "We have 5 available rooms in house 1.",
  "toolsCalled": ["count_rooms_by_house_and_status"],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## How It Works

1. User sends a message to the agent
2. Agent analyzes the message using Ollama LLM
3. Agent identifies required MCP tools to call
4. Agent executes tools via MCP Server
5. Agent formats response based on tool results
6. Response is sent back to user

## Supported Use Cases

- Get room/house/tenant information
- Create/update contracts and invoices
- Record payments
- Generate reports and statistics
- User management
- And more...

## Tool Categories

All 40+ MCP tools are available including:
- Auth management
- User management
- House management
- Room management
- Tenant management
- Contract management
- Service management
- Invoice management

