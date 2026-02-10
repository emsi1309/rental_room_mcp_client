/**
 * Main AI Agent Implementation
 * Orchestrates LLM and tool execution
 */

import { callOllama, parseToolCalls } from './ollama-client.js';
import { executeMcpTool, createToolContext } from './tool-executor.js';
import { systemPrompt } from '../utils/prompt.js';
import logger from '../utils/logger.js';
import config from '../config.js';
import sessionManager from './session-manager.js';

export class HostelAIAgent {
  constructor() {
    this.systemPrompt = systemPrompt;
    this.conversationHistory = [];
    this.maxToolCalls = config.maxToolCalls;
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
      // Get current session context
      const sessionContext = sessionManager.getSessionContext(sessionId);

      // Add user message to history
      this.conversationHistory.push({
        role: 'user',
        content: userMessage,
        userId: userId || sessionContext.userId,
        sessionId: sessionId || 'default',
        timestamp: new Date(),
      });

      // Build prompt with context
      const toolContext = await createToolContext();
      const conversationContext = this.buildConversationContext();

      const fullPrompt = `${this.systemPrompt}

${toolContext}

${conversationContext}

User: ${userMessage}

Please analyze the user's request and respond. If you need to call tools, format them as:
[TOOL_CALL]: tool_name({"param1": "value1", "param2": "value2"}) [/TOOL_CALL]

You can call multiple tools if needed. After calling tools, provide your final response.`;

      // Call LLM
      logger.debug('Calling LLM...');
      const llmResponse = await callOllama(fullPrompt);
      logger.debug(`LLM Response: ${llmResponse.substring(0, 200)}...`);

      // Parse tool calls from response
      const toolCalls = parseToolCalls(llmResponse);
      logger.info(`Found ${toolCalls.length} tool calls in LLM response`);

      // Execute tools
      const toolResults = [];
      let toolCallsExecuted = 0;

      for (const toolCall of toolCalls) {
        if (toolCallsExecuted >= this.maxToolCalls) {
          logger.warn(`Reached maximum tool calls limit: ${this.maxToolCalls}`);
          break;
        }

        try {
          logger.info(`Executing tool: ${toolCall.name}`);
          // Pass session context when executing tools
          const result = await executeMcpTool(toolCall.name, toolCall.args, sessionContext);
          toolResults.push({
            name: toolCall.name,
            args: toolCall.args,
            result,
          });
          toolCallsExecuted++;
        } catch (error) {
          logger.error(`Tool execution failed: ${toolCall.name}`, error);
          toolResults.push({
            name: toolCall.name,
            error: error.message,
          });
        }
      }

      // Generate final response based on tool results
      let finalResponse = llmResponse;

      if (toolResults.length > 0) {
        // Call LLM again to generate final response with tool results
        const finalPrompt = `${this.systemPrompt}

Based on the user's request and the tool execution results, provide a helpful response.

User request: ${userMessage}

Tool results:
${JSON.stringify(toolResults, null, 2)}

Please provide a clear, concise response to the user in their language (Vietnamese preferred if applicable).`;

        finalResponse = await callOllama(finalPrompt);
      }

      // Add assistant response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: finalResponse,
        toolsCalled: toolCalls.map((t) => t.name),
        sessionId: sessionId || 'default',
        timestamp: new Date(),
      });

      return {
        success: true,
        response: finalResponse,
        toolsCalled: toolCalls.map((t) => t.name),
        toolResults: toolResults,
        userId: userId || sessionContext.userId,
        sessionId: sessionId || 'default',
        isAuthenticated: sessionContext.isAuthenticated,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Error processing message', error);
      return {
        success: false,
        error: error.message,
        response: 'Xin lỗi, tôi gặp lỗi khi xử lý yêu cầu của bạn. Vui lòng thử lại sau.',
        userId: userId,
        sessionId: sessionId || 'default',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Build conversation context for the LLM
   * @private
   * @returns {string} Formatted conversation history
   */
  buildConversationContext() {
    if (this.conversationHistory.length === 0) {
      return '';
    }

    // Keep last 10 messages for context
    const recentHistory = this.conversationHistory.slice(-10);
    let context = 'Conversation History:\n';

    recentHistory.forEach((msg) => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      context += `${role}: ${msg.content}\n`;
    });

    return context;
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = [];
    logger.info('Conversation history cleared');
  }

  /**
   * Get conversation history
   * @returns {Array} Current conversation history
   */
  getHistory() {
    return this.conversationHistory;
  }
}

export default HostelAIAgent;

