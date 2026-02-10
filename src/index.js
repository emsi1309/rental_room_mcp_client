/**
 * AI Agent Express Server
 */

console.log('🚀 Starting AI Agent...');

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import config from './config.js';
import logger from './utils/logger.js';
import chatRoutes from './routes/chat.js';
import { isOllamaAvailable } from './agent/ollama-client.js';
import { isMcpServerAvailable } from './agent/tool-executor.js';

console.log('✓ Imports loaded');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const ollamaAvailable = await isOllamaAvailable();
  const mcpServerAvailable = await isMcpServerAvailable();

  const status = {
    agent: 'running',
    ollama: ollamaAvailable ? 'connected' : 'disconnected',
    mcpServer: mcpServerAvailable ? 'connected' : 'disconnected',
    timestamp: new Date(),
  };

  res.json(status);
});

// API Routes
app.use('/api', chatRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Express error', err);
  res.status(500).json({
    success: false,
    error: err.message,
  });
});

// Start server
async function startServer() {
  try {
    logger.info('Checking external services...');

    const ollamaAvailable = await isOllamaAvailable();
    const mcpServerAvailable = await isMcpServerAvailable();

    if (!ollamaAvailable) {
      logger.warn('⚠️  Ollama is not available. Make sure Ollama is running on ' + config.ollamaApiUrl);
    } else {
      logger.info('✓ Ollama is connected');
    }

    if (!mcpServerAvailable) {
      logger.warn('⚠️  MCP Server is not available. Make sure MCP Server is running on ' + config.mcpServerUrl);
    } else {
      logger.info('✓ MCP Server is connected');
    }

    app.listen(config.agentPort, () => {
      logger.info(`🚀 AI Agent Server started on port ${config.agentPort}`);
      logger.info(`📝 Chat endpoint: POST http://localhost:${config.agentPort}/api/chat`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

export { app };

// Start if this is the main module
console.log('✓ Checking if this is main module...');
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].includes('index.js')) {
  console.log('✓ Main module detected, starting server...');
  startServer();
} else {
  console.log('⚠️ Not main module, skipping startup');
}

