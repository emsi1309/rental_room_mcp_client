/**
 * Ollama LLM Client
 * Interfaces with Ollama for LLM capabilities with function calling via JSON output
 */

import axios from 'axios';
import config from '../config.js';
import logger from '../utils/logger.js';

const ollamaClient = axios.create({
  baseURL: config.ollamaApiUrl,
  timeout: config.llmTimeout,
});

/**
 * Call Ollama LLM with a prompt (simple generate)
 */
export async function callOllama(prompt, options = {}) {
  try {
    const response = await ollamaClient.post('/generate', {
      model: config.ollamaModel,
      prompt,
      stream: false,
      temperature: options.temperature ?? config.temperature,
    });
    return response.data.response;
  } catch (error) {
    logger.error('Ollama API call failed', error);
    throw new Error(`LLM Error: ${error.message}`);
  }
}

/**
 * Build a tool-calling prompt that instructs the LLM to output JSON.
 * This approach is more reliable than native tool_calls for models
 * that don't support it well (qwen2.5-coder, mistral, etc.)
 */
function buildToolCallingPrompt(tools) {
  const toolDescriptions = tools.map(t => {
    const params = t.inputSchema?.properties || {};
    const required = t.inputSchema?.required || [];
    const paramList = Object.entries(params).map(([k, v]) => {
      const req = required.includes(k) ? ' (required)' : ' (optional)';
      return `      ${k}: ${v.type}${req} - ${v.description || ''}`;
    }).join('\n');
    return `  - ${t.name}: ${t.description || ''}${paramList ? '\n    Parameters:\n' + paramList : ''}`;
  }).join('\n');

  return `You have access to these tools:\n${toolDescriptions}\n
INSTRUCTIONS:
- To call a tool, respond ONLY with a JSON object in this exact format:
  {"tool": "tool_name", "args": {"param1": "value1", "param2": "value2"}}
- Do NOT add any text before or after the JSON.
- Do NOT wrap the JSON in markdown code blocks.
- If you need to call a tool, respond with ONLY the JSON object.
- If the user is just chatting (greeting, thanks, etc.) and no tool is needed, respond normally with text.`;
}

/**
 * Parse tool call from LLM content response.
 * Handles various formats the model might output.
 */
function parseToolCallFromContent(content, knownToolNames) {
  if (!content || knownToolNames.length === 0) return null;

  let cleaned = content.trim();
  // Strip markdown code fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  // Strategy 1: Entire content is a JSON object with "tool" field
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') {
      const toolName = parsed.tool || parsed.name || parsed.function;
      const args = parsed.args || parsed['arguments'] || parsed.parameters || {};
      if (toolName && knownToolNames.includes(toolName)) {
        return { name: toolName, arguments: typeof args === 'string' ? JSON.parse(args) : args };
      }
    }
  } catch (_) { /* not pure JSON */ }

  // Strategy 2: Extract balanced JSON objects from text
  const jsonObjects = extractBalancedJsonObjects(cleaned);
  for (const jsonStr of jsonObjects) {
    try {
      const parsed = JSON.parse(jsonStr);
      const toolName = parsed.tool || parsed.name || parsed.function;
      const args = parsed.args || parsed['arguments'] || parsed.parameters || {};
      if (toolName && knownToolNames.includes(toolName)) {
        return { name: toolName, arguments: typeof args === 'string' ? JSON.parse(args) : args };
      }
    } catch (_) { /* skip */ }
  }

  // Strategy 3: Look for tool name mentioned in text and try to extract from context
  for (const toolName of knownToolNames) {
    if (cleaned.includes(toolName)) {
      // Try to find JSON args nearby
      const idx = cleaned.indexOf(toolName);
      const after = cleaned.substring(idx);
      const jsonMatch = after.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const args = JSON.parse(jsonMatch[0]);
          // If this JSON has the tool name as a key, it's the tool call wrapper
          if (args.tool === toolName || args.name === toolName) {
            return { name: toolName, arguments: args.args || args['arguments'] || {} };
          }
          // Otherwise the JSON IS the args
          return { name: toolName, arguments: args };
        } catch (_) { /* skip */ }
      }
      // Tool name found but no parseable args - call with empty args
      return { name: toolName, arguments: {} };
    }
  }

  return null;
}

/**
 * Extract balanced JSON objects from text (handles nested braces).
 */
function extractBalancedJsonObjects(text) {
  const results = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        results.push(text.substring(start, i + 1));
        start = -1;
      }
    }
  }
  return results;
}

/**
 * Call Ollama with tool-calling support.
 * Uses JSON-in-prompt approach for reliable tool calling across all models.
 *
 * @param {Array} messages - Conversation messages
 * @param {Array} availableTools - MCP tools available for use
 * @param {object} options - Additional options
 * @returns {Promise<object>} Response with message and toolCalls
 */
export async function callOllamaWithTools(messages, availableTools = [], options = {}) {
  try {
    const knownToolNames = availableTools.map(t => t.name);
    logger.debug(`Calling Ollama chat API with ${availableTools.length} tools`);

    // Build messages: inject tool descriptions into the system prompt
    const messagesWithTools = [...messages];
    if (availableTools.length > 0) {
      const toolPrompt = buildToolCallingPrompt(availableTools);
      // Prepend or merge with existing system message
      if (messagesWithTools[0]?.role === 'system') {
        messagesWithTools[0] = {
          role: 'system',
          content: messagesWithTools[0].content + '\n\n' + toolPrompt,
        };
      } else {
        messagesWithTools.unshift({ role: 'system', content: toolPrompt });
      }
    }

    const requestBody = {
      model: config.ollamaModel,
      messages: messagesWithTools,
      stream: false,
      temperature: options.temperature ?? 0,
      // Do NOT pass tools param - we handle tool calling via prompt + JSON parsing
    };

    logger.debug(`Messages count: ${messagesWithTools.length}`);

    const response = await ollamaClient.post('/chat', requestBody);
    const message = response.data.message;

    logger.debug(`Raw LLM response: ${(message?.content || '').substring(0, 300)}`);

    // Try to parse tool call from content
    let toolCalls = [];
    if (message?.content && knownToolNames.length > 0) {
      const parsed = parseToolCallFromContent(message.content, knownToolNames);
      if (parsed) {
        toolCalls = [{
          id: `call_${Date.now()}`,
          function: {
            name: parsed.name,
            arguments: parsed.arguments,
          },
        }];
        // Clear content since it was a tool call, not a user-facing response
        message.content = '';
      }
    }

    // Also check native tool_calls (in case model supports it)
    if (toolCalls.length === 0 && message?.tool_calls?.length > 0) {
      toolCalls = message.tool_calls.filter(tc => tc.function?.name);
    }

    if (toolCalls.length > 0) {
      logger.info(`✅ Tool calls: ${toolCalls.map(tc => tc.function.name).join(', ')}`);
    } else if (availableTools.length > 0) {
      logger.warn(`⚠️  No tool calls in response. Content: ${message?.content?.substring(0, 200)}`);
    }

    return { message, toolCalls };
  } catch (error) {
    logger.error('Ollama chat API call failed', error);
    throw new Error(`LLM Error: ${error.message}`);
  }
}

/**
 * Check if Ollama is available
 */
export async function isOllamaAvailable() {
  try {
    const response = await axios.get(`${config.ollamaApiUrl}/tags`, { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    logger.warn('Ollama not available', error.message);
    return false;
  }
}


export default { callOllama, callOllamaWithTools, isOllamaAvailable };
