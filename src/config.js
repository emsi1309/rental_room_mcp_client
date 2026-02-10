import dotenv from 'dotenv';

dotenv.config();

const config = {
  // Ollama Configuration
  ollamaApiUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434/api',
  ollamaModel: process.env.OLLAMA_MODEL || 'mistral',

  // MCP Server Configuration
  mcpServerUrl: process.env.MCP_SERVER_URL || 'http://localhost:3001',

  // Backend API Configuration
  backendApiUrl: process.env.BACKEND_API_URL || 'http://localhost:8080/api',

  // Agent Server Configuration
  agentPort: parseInt(process.env.AGENT_PORT || '3002'),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Timeouts
  requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '30000'),
  llmTimeout: parseInt(process.env.LLM_TIMEOUT || '60000'),

  // Agent Configuration
  maxToolCalls: parseInt(process.env.MAX_TOOL_CALLS || '5'),
  temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
};

export default config;

