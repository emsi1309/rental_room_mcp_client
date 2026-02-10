/**
 * MCP Tool Executor
 * Executes tools from MCP Server
 */

import axios from 'axios';
import config from '../config.js';
import logger from '../utils/logger.js';

const mcpClient = axios.create({
  baseURL: config.mcpServerUrl,
  timeout: config.requestTimeout,
});

/**
 * Get available tools from MCP Server
 * @returns {Promise<Array>} List of available tools
 */
export async function getAvailableTools() {
  try {
    logger.debug('Fetching available tools from MCP Server');
    const response = await mcpClient.get('/api/tools');
    return response.data.tools || [];
  } catch (error) {
    logger.error('Failed to fetch tools from MCP Server', error.message);
    return [];
  }
}

/**
 * Execute a tool via MCP Server
 * @param {string} toolName - Name of the tool to execute
 * @param {object} args - Arguments for the tool
 * @param {object} sessionContext - Session context with auth token
 * @returns {Promise<object>} Tool execution result
 */
export async function executeMcpTool(toolName, args, sessionContext = null) {
  try {
    logger.info(`Executing MCP tool: ${toolName}`);
    logger.debug(`Tool arguments: ${JSON.stringify(args)}`);

    // Build request headers with auth token if available
    const headers = {};
    if (sessionContext && sessionContext.token) {
      headers['Authorization'] = `Bearer ${sessionContext.token}`;
      headers['X-User-Id'] = sessionContext.userId || 'anonymous';
      logger.debug(`Added Authorization header for user: ${sessionContext.userId}`);
    }

    const response = await mcpClient.post(`/api/tools/${toolName}`, args, { headers });

    logger.debug(`Tool result: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    logger.error(`MCP tool execution failed: ${toolName}`, error.message);
    return {
      success: false,
      error: error.response?.data?.error || error.message,
    };
  }
}

/**
 * Create a tool execution context with all available tools
 * @returns {Promise<string>} Formatted tool context for LLM
 */
export async function createToolContext() {
  try {
    const tools = await getAvailableTools();

    let context = 'Available Tools:\n\n';
    const categories = {};

    // Group tools by category
    tools.forEach((tool) => {
      const category = tool.name.split('_')[0] || 'other';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(tool);
    });

    // Format by category
    Object.entries(categories).forEach(([category, categoryTools]) => {
      context += `${category.toUpperCase()}:\n`;
      categoryTools.forEach((tool) => {
        context += `- ${tool.name}: ${tool.description}\n`;
      });
      context += '\n';
    });

    return context;
  } catch (error) {
    logger.error('Failed to create tool context', error);
    return 'No tools available\n';
  }
}

/**
 * Check if MCP Server is available
 * @returns {Promise<boolean>}
 */
export async function isMcpServerAvailable() {
  try {
    const response = await mcpClient.get('/api/health');
    return response.status === 200;
  } catch (error) {
    logger.warn('MCP Server not available', error.message);
    return false;
  }
}

export default {
  getAvailableTools,
  executeMcpTool,
  createToolContext,
  isMcpServerAvailable,
};

