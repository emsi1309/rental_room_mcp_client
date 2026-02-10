/**
 * Chat API Routes
 */

import express from 'express';
import HostelAIAgent from '../agent/agent.js';
import sessionManager from '../agent/session-manager.js';
import logger from '../utils/logger.js';

const router = express.Router();
const agent = new HostelAIAgent();

/**
 * POST /api/chat
 * Send a message to the AI agent
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, userId, sessionId, authToken } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required',
      });
    }

    // If authToken is provided in request, store it in session
    if (authToken) {
      sessionManager.setToken(authToken, userId || 'anonymous', sessionId);
    }

    logger.info(`Chat request from user: ${userId || 'anonymous'}, sessionId: ${sessionId || 'default'}`);

    const result = await agent.processMessage(message, userId, sessionId);

    res.json(result);
  } catch (error) {
    logger.error('Chat route error', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/session
 * Get current session info
 */
router.get('/session', (req, res) => {
  try {
    const sessionId = req.query.sessionId || 'default';
    const sessionContext = sessionManager.getSessionContext(sessionId);

    res.json({
      success: true,
      session: sessionContext,
    });
  } catch (error) {
    logger.error('Get session error', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/session/logout
 * Logout and clear session
 */
router.post('/session/logout', (req, res) => {
  try {
    const { sessionId } = req.body;
    sessionManager.clearSession(sessionId);

    res.json({
      success: true,
      message: 'Session cleared',
    });
  } catch (error) {
    logger.error('Logout error', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/chat/clear-history
 * Clear conversation history
 */
router.post('/chat/clear-history', (req, res) => {
  try {
    agent.clearHistory();
    res.json({
      success: true,
      message: 'Conversation history cleared',
    });
  } catch (error) {
    logger.error('Clear history error', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/chat/history
 * Get conversation history
 */
router.get('/chat/history', (req, res) => {
  try {
    const history = agent.getHistory();
    res.json({
      success: true,
      history,
      count: history.length,
    });
  } catch (error) {
    logger.error('Get history error', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;

