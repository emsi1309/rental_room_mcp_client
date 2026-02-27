/**
 * Tool Filtering and Selection
 * Intelligently select relevant tools based on user query
 */

import logger from '../utils/logger.js';

/**
 * Keyword mapping for tool categories
 */
const TOOL_KEYWORDS = {
  auth: ['login', 'đăng nhập', 'đăng ký', 'register', 'logout', 'thoát', 'current user', 'người dùng hiện tại', 'token'],
  house: ['nhà', 'house', 'building', 'tòa nhà', 'dãy nhà'],
  room: ['phòng', 'room', 'trống', 'available', 'vacant', 'empty'],
  tenant: ['khách', 'tenant', 'người thuê', 'cư dân'],
  contract: ['hợp đồng', 'contract', 'thuê'],
  service: ['dịch vụ', 'service', 'tiện ích', 'utility'],
  invoice: ['hóa đơn', 'invoice', 'bill', 'thanh toán', 'payment'],
  user: ['user', 'người dùng', 'tài khoản', 'account'],
};

/**
 * Normalize text for comparison (remove diacritics)
 */
function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

/**
 * Get tool category from tool name
 */
function getToolCategory(toolName) {
  if (toolName.includes('login') || toolName.includes('register') || toolName.includes('auth') || toolName.includes('refresh_token')) {
    return 'auth';
  }
  if (toolName.includes('house')) return 'house';
  if (toolName.includes('room') && !toolName.includes('room_service')) return 'room';
  if (toolName.includes('tenant')) return 'tenant';
  if (toolName.includes('contract')) return 'contract';
  if (toolName.includes('service') || toolName.includes('room_service')) return 'service';
  if (toolName.includes('invoice') || toolName.includes('payment')) return 'invoice';
  if (toolName.includes('user') || toolName.includes('password')) return 'user';
  return 'other';
}

/**
 * Detect relevant categories from user message
 */
function detectRelevantCategories(userMessage) {
  const norm = normalize(userMessage);
  const relevantCategories = new Set();

  for (const [category, keywords] of Object.entries(TOOL_KEYWORDS)) {
    for (const keyword of keywords) {
      if (norm.includes(normalize(keyword))) {
        relevantCategories.add(category);
        break;
      }
    }
  }

  // If no specific category detected, include common categories
  if (relevantCategories.size === 0) {
    logger.debug('No specific category detected, using default categories');
    return ['house', 'room', 'tenant', 'invoice'];
  }

  return Array.from(relevantCategories);
}

/**
 * Filter tools based on user query to reduce context size
 * @param {Array} allTools - All available tools
 * @param {string} userMessage - User's message
 * @param {number} maxTools - Maximum number of tools to return (default: 25)
 * @returns {Array} Filtered tools relevant to the query
 */
export function filterRelevantTools(allTools, userMessage, maxTools = 25) {
  // Detect relevant categories
  const relevantCategories = detectRelevantCategories(userMessage);
  logger.debug(`Detected categories: ${relevantCategories.join(', ')}`);

  // Get tools for relevant categories
  const relevantTools = allTools.filter(t => {
    const category = getToolCategory(t.name);
    return relevantCategories.includes(category);
  });

  // Remove duplicates and limit
  const uniqueTools = Array.from(new Map(relevantTools.map(t => [t.name, t])).values());
  const finalTools = uniqueTools.slice(0, maxTools);

  logger.info(`Filtered tools: ${allTools.length} → ${finalTools.length} (categories: ${relevantCategories.join(', ')})`);

  if (finalTools.length <= 15) {
    logger.debug(`Selected tools: ${finalTools.map(t => t.name).join(', ')}`);
  }

  return finalTools;
}

export default { filterRelevantTools };
