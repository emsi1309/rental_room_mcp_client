/**
 * Ollama LLM Client
 * Interfaces with Ollama for LLM capabilities
 */

import axios from 'axios';
import config from '../config.js';
import logger from '../utils/logger.js';

const ollamaClient = axios.create({
  baseURL: config.ollamaApiUrl,
  timeout: config.llmTimeout,
});

/**
 * Call Ollama LLM with a prompt
 * @param {string} prompt - The prompt to send
 * @param {object} options - Additional options
 * @returns {Promise<string>} The LLM response
 */
export async function callOllama(prompt, options = {}) {
  try {
    logger.debug(`Calling Ollama with model: ${config.ollamaModel}`);

    const response = await ollamaClient.post('/generate', {
      model: config.ollamaModel,
      prompt,
      stream: false,
      temperature: options.temperature ?? config.temperature,
      top_p: options.topP ?? 0.9,
      top_k: options.topK ?? 40,
    });

    return response.data.response;
  } catch (error) {
    logger.error('Ollama API call failed', error);
    throw new Error(`LLM Error: ${error.message}`);
  }
}

/**
 * Parse tool calls from LLM response
 * @param {string} response - The LLM response text
 * @returns {Array} Array of tool calls with name and arguments
 */
export function parseToolCalls(response) {
  logger.debug(`Parsing tool calls from response: ${response}`);
  const toolCalls = [];
  const toolPattern = /\[TOOL_CALL\]:\s*(\w+)\s*\(([\s\S]*?)\)\s*\[\/TOOL_CALL\]/gi;

  let match;
  while ((match = toolPattern.exec(response)) !== null) {
    const toolName = match[1];
    let argsStr = match[2].trim();

    try {
      // Clean up args string before parsing
      // Handles cases where LLM includes newlines or trailing commas
      argsStr = argsStr.replace(/,(\s*})$/, '$1'); // Remove trailing comma

      // Attempt to fix unquoted keys, which is a common LLM mistake
      if (!argsStr.startsWith('{')) {
        argsStr = `{${argsStr}}`;
      }
      argsStr = argsStr.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":');

      logger.debug(`Parsing tool call: ${toolName} with args: ${argsStr}`);
      const args = JSON.parse(argsStr);
      toolCalls.push({ name: toolName, args });
    } catch (e) {
      logger.warn(`Failed to parse tool arguments for ${toolName}: ${argsStr}`, e);
      // Fallback for malformed JSON that can't be auto-corrected
      toolCalls.push({ name: toolName, args: { error: 'Malformed arguments', details: argsStr } });
    }
  }

  if (toolCalls.length > 0) {
    logger.info(`Found ${toolCalls.length} tool calls.`);
  } else {
    logger.info('No tool calls found in response.');
  }

  return toolCalls;
}


/**
 * Check if Ollama is available
 * @returns {Promise<boolean>}
 */
export async function isOllamaAvailable() {
  try {
    const response = await axios.get(`${config.ollamaApiUrl}/tags`, {
      timeout: 5000,
    });
    return response.status === 200;
  } catch (error) {
    logger.warn('Ollama not available', error.message);
    return false;
  }
}

export default {
  callOllama,
  parseToolCalls,
  isOllamaAvailable,
};

