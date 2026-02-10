/**
 * Session Manager
 * Manages user authentication tokens and session context
 */

import logger from '../utils/logger.js';

class SessionManager {
  constructor() {
    // Store tokens per user session
    // Format: { userId: { token, expiresAt, refreshToken, loginTime } }
    this.sessions = new Map();
    this.defaultSessionId = 'default';
  }

  /**
   * Set authentication token for a session
   * @param {string} token - JWT access token
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID (optional)
   * @param {object} additionalData - Additional data (refreshToken, expiresIn, etc)
   */
  setToken(token, userId, sessionId = null, additionalData = {}) {
    const sid = sessionId || this.defaultSessionId;

    if (!this.sessions.has(sid)) {
      this.sessions.set(sid, {});
    }

    const expiresIn = additionalData.expiresIn || 3600; // Default 1 hour
    const expiresAt = Date.now() + expiresIn * 1000;

    this.sessions.get(sid).token = token;
    this.sessions.get(sid).userId = userId;
    this.sessions.get(sid).expiresAt = expiresAt;
    this.sessions.get(sid).refreshToken = additionalData.refreshToken || null;
    this.sessions.get(sid).loginTime = Date.now();

    logger.info(`Token set for session ${sid}, user ${userId}, expires in ${expiresIn}s`);
  }

  /**
   * Get authentication token for a session
   * @param {string} sessionId - Session ID (optional)
   * @returns {string|null} JWT access token
   */
  getToken(sessionId = null) {
    const sid = sessionId || this.defaultSessionId;
    const session = this.sessions.get(sid);

    if (!session || !session.token) {
      return null;
    }

    // Check if token is expired
    if (session.expiresAt && Date.now() > session.expiresAt) {
      logger.warn(`Token expired for session ${sid}`);
      this.clearSession(sid);
      return null;
    }

    return session.token;
  }

  /**
   * Get session context (token, userId, sessionId)
   * @param {string} sessionId - Session ID (optional)
   * @returns {object} Session context
   */
  getSessionContext(sessionId = null) {
    const sid = sessionId || this.defaultSessionId;
    const session = this.sessions.get(sid);

    if (!session) {
      return {
        sessionId: sid,
        isAuthenticated: false,
        token: null,
        userId: null,
      };
    }

    return {
      sessionId: sid,
      isAuthenticated: !!session.token && (!session.expiresAt || Date.now() <= session.expiresAt),
      token: this.getToken(sid),
      userId: session.userId,
      expiresAt: session.expiresAt,
      refreshToken: session.refreshToken,
    };
  }

  /**
   * Check if session is authenticated
   * @param {string} sessionId - Session ID (optional)
   * @returns {boolean}
   */
  isAuthenticated(sessionId = null) {
    const context = this.getSessionContext(sessionId);
    return context.isAuthenticated;
  }

  /**
   * Clear a session (logout)
   * @param {string} sessionId - Session ID (optional)
   */
  clearSession(sessionId = null) {
    const sid = sessionId || this.defaultSessionId;

    if (this.sessions.has(sid)) {
      this.sessions.delete(sid);
      logger.info(`Session cleared: ${sid}`);
    }
  }

  /**
   * Clear all sessions
   */
  clearAllSessions() {
    this.sessions.clear();
    logger.info('All sessions cleared');
  }

  /**
   * Update refresh token
   * @param {string} refreshToken - New refresh token
   * @param {string} sessionId - Session ID (optional)
   */
  setRefreshToken(refreshToken, sessionId = null) {
    const sid = sessionId || this.defaultSessionId;

    if (this.sessions.has(sid)) {
      this.sessions.get(sid).refreshToken = refreshToken;
    }
  }

  /**
   * Get all sessions info (for debugging)
   * @returns {object}
   */
  getAllSessions() {
    const info = {};

    this.sessions.forEach((session, sid) => {
      info[sid] = {
        userId: session.userId,
        isExpired: session.expiresAt ? Date.now() > session.expiresAt : false,
        expiresAt: session.expiresAt,
        hasRefreshToken: !!session.refreshToken,
      };
    });

    return info;
  }
}

export default new SessionManager();

