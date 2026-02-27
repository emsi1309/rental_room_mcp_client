/**
 * Main AI Agent Implementation
 * Orchestrates LLM and tool execution using native function calling
 */

import { callOllamaWithTools } from './ollama-client.js';
import { executeMcpTool, getAvailableTools } from './tool-executor.js';
import { filterRelevantTools } from './tool-filter.js';
import { systemPrompt } from '../utils/prompt.js';
import sessionManager from './session-manager.js';
import logger from '../utils/logger.js';
import config from '../config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if text contains non-English characters (e.g. Vietnamese)
 */
function isNonEnglish(text) {
  return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text);
}

/**
 * Detect if a message is purely conversational (greeting, small talk)
 */
function isConversationalMessage(text) {
  const conversational = [
    'xin chào', 'chào bạn', 'hello', 'hi ', 'hey',
    'bạn là ai', 'who are you', 'bạn tên gì',
    'cảm ơn', 'thank', 'thanks',
    'tạm biệt', 'goodbye', 'bye',
  ];
  const lower = text.toLowerCase().trim();
  // Only treat as conversational if short AND matches a pattern
  return lower.length < 40 && conversational.some(kw => lower.includes(kw));
}

// ---------------------------------------------------------------------------
// Agent Class
// ---------------------------------------------------------------------------

class HostelAIAgent {
  constructor() {
    this.systemPrompt = systemPrompt;
    this.conversationHistory = [];
    this.maxToolCalls = config.maxToolCalls || 5;
  }

  /**
   * Process a user message and return AI response
   * @param {string} userMessage - The user's message
   * @param {string} userId - Optional user ID
   * @param {string} sessionId - Optional session ID for context
   * @returns {Promise<object>} Agent response with tools called and result
   */
  async processMessage(userMessage, userId = null, sessionId = null) {
    logger.info(`Processing message: ${userMessage}`);

    try {
      const sessionContext = sessionManager.getSessionContext(sessionId);
      const isVietnamese = isNonEnglish(userMessage);

      // -----------------------------------------------------------------------
      // Stage 1: Detect conversational message (no tools needed)
      // -----------------------------------------------------------------------
      if (isConversationalMessage(userMessage)) {
        logger.info('Conversational message detected - skipping tool calling');
        const resp = await callOllamaWithTools(
          [{ role: 'system', content: 'You are a friendly hostel management assistant. Respond in the same language as the user.' },
           { role: 'user', content: userMessage }],
          [], { temperature: 0.5 }
        );
        const text = resp.message.content || 'Xin chào! Tôi là trợ lý quản lý nhà trọ.';
        this._addHistory('user', userMessage, sessionId);
        this._addHistory('assistant', text, sessionId);
        return this._buildResponse(true, text, [], [], userId, sessionId, sessionContext);
      }

      // -----------------------------------------------------------------------
      // Stage 2: Load & filter tools
      // -----------------------------------------------------------------------
      const allTools = await getAvailableTools();
      logger.info(`Loaded ${allTools.length} tools from MCP server`);

      const availableTools = filterRelevantTools(allTools, userMessage, 15);
      logger.info(`Using ${availableTools.length} relevant tools for this query`);

      // -----------------------------------------------------------------------
      // Stage 3: Call LLM with tools - KEEP IT SIMPLE
      // Send the user message directly, no translation, no complex wrapping
      // -----------------------------------------------------------------------
      const messages = [
        { role: 'system', content: this.systemPrompt },
        // Include last few history items for context
        ...this.conversationHistory.slice(-6).map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        { role: 'user', content: userMessage },
      ];

      logger.debug('Calling LLM with function calling...');
      const llmResponse = await callOllamaWithTools(messages, availableTools, {
        temperature: 0,
      });

      let { message, toolCalls } = llmResponse;
      logger.info(`LLM returned ${toolCalls.length} tool call(s)`);

      // -----------------------------------------------------------------------
      // Stage 4: If no tool calls on first attempt, retry with stronger prompt
      // -----------------------------------------------------------------------
      if (toolCalls.length === 0 && availableTools.length > 0) {
        logger.info('No tool calls on first attempt, retrying with explicit instruction...');
        const toolList = availableTools.map(t => t.name).join(', ');
        const retryMessages = [
          { role: 'system', content: `You MUST call one of these tools: [${toolList}]. Do NOT respond with text. Call the tool now.` },
          { role: 'user', content: userMessage },
        ];
        const retryResponse = await callOllamaWithTools(retryMessages, availableTools, { temperature: 0 });
        if (retryResponse.toolCalls.length > 0) {
          message = retryResponse.message;
          toolCalls = retryResponse.toolCalls;
          logger.info(`Retry succeeded: ${toolCalls.length} tool call(s)`);
        } else {
          logger.warn('Retry also failed to produce tool calls');
        }
      }

      // -----------------------------------------------------------------------
      // Stage 5: Execute tools
      // -----------------------------------------------------------------------
      const toolResults = [];
      let toolCallsExecuted = 0;

      for (const toolCall of toolCalls) {
        if (toolCallsExecuted >= this.maxToolCalls) {
          logger.warn(`Reached maximum tool calls limit: ${this.maxToolCalls}`);
          break;
        }

        try {
          const toolName = toolCall.function.name;
          const toolArgs = typeof toolCall.function.arguments === 'string'
            ? JSON.parse(toolCall.function.arguments || '{}')
            : toolCall.function.arguments || {};

          logger.info(`Executing tool: ${toolName}(${JSON.stringify(toolArgs)})`);

          const result = await executeMcpTool(toolName, toolArgs, sessionContext);

          toolResults.push({
            id: toolCall.id || `call_${toolCallsExecuted}`,
            name: toolName,
            args: toolArgs,
            result,
          });
          toolCallsExecuted++;
        } catch (error) {
          logger.error(`Tool execution failed: ${toolCall.function?.name}`, error);
          toolResults.push({
            id: toolCall.id || `call_${toolCallsExecuted}`,
            name: toolCall.function?.name || 'unknown',
            error: error.message,
          });
          toolCallsExecuted++;
        }
      }

      // -----------------------------------------------------------------------
      // Stage 6: Build final response
      // -----------------------------------------------------------------------
      let finalResponseText;

      if (toolResults.length > 0) {
        // Summarize tool results
        logger.debug('Getting final formatted response...');
        const summaryMessages = [
          { role: 'system', content: isVietnamese
            ? 'Tóm tắt kết quả dưới đây bằng tiếng Việt, ngắn gọn và rõ ràng.'
            : 'Summarize the following results clearly and concisely.' },
          { role: 'user', content: `User asked: "${userMessage}"\n\nTool results:\n${JSON.stringify(toolResults.map(r => ({ tool: r.name, result: r.result })), null, 2)}` },
        ];
        const finalResp = await callOllamaWithTools(summaryMessages, [], { temperature: 0.3 });
        finalResponseText = finalResp.message.content || 'Đã xử lý xong.';
      } else {
        finalResponseText = message.content || (isVietnamese
          ? 'Xin lỗi, tôi không thể xử lý yêu cầu này.'
          : 'Sorry, I could not process this request.');
      }

      // -----------------------------------------------------------------------
      // Stage 7: Update conversation history
      // -----------------------------------------------------------------------
      this._addHistory('user', userMessage, sessionId, userId || sessionContext.userId);
      this._addHistory('assistant', finalResponseText, sessionId, null, toolResults.map(t => t.name));

      return this._buildResponse(true, finalResponseText, toolResults.map(t => t.name), toolResults, userId || sessionContext.userId, sessionId, sessionContext);

    } catch (error) {
      logger.error('Agent processMessage error', error);
      return this._buildResponse(false, `Error: ${error.message}`, [], [], userId, sessionId);
    }
  }

  _addHistory(role, content, sessionId, userId = null, toolsCalled = []) {
    this.conversationHistory.push({
      role, content,
      ...(userId && { userId }),
      ...(toolsCalled.length > 0 && { toolsCalled }),
      sessionId: sessionId || 'default',
      timestamp: new Date(),
    });
  }

  _buildResponse(success, response, toolsCalled, toolResults, userId, sessionId, sessionContext = {}) {
    return {
      success,
      response,
      toolsCalled,
      toolResults,
      userId,
      sessionId: sessionId || 'default',
      isAuthenticated: sessionContext.isAuthenticated || false,
      timestamp: new Date(),
    };
  }

  getHistory() {
    return this.conversationHistory;
  }

  clearHistory() {
    this.conversationHistory = [];
  }
}

export default HostelAIAgent;

