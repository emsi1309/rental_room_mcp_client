import config from '../config.js';

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel = logLevels[config.logLevel] || 2;

const logger = {
  error: (message, error = null) => {
    if (currentLevel >= logLevels.error) {
      console.error(`[ERROR] ${message}`, error || '');
    }
  },
  warn: (message) => {
    if (currentLevel >= logLevels.warn) {
      console.warn(`[WARN] ${message}`);
    }
  },
  info: (message) => {
    if (currentLevel >= logLevels.info) {
      console.log(`[INFO] ${message}`);
    }
  },
  debug: (message) => {
    if (currentLevel >= logLevels.debug) {
      console.log(`[DEBUG] ${message}`);
    }
  },
};

export default logger;

