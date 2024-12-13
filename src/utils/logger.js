const winston = require("winston");

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({
      filename: "error.log",
      level: "error",
    }),
    new winston.transports.File({
      filename: "combined.log",
    }),
  ],
});

// Helper functions for structured logging
function logVoiceEvent(event, userId, guildId, metadata = {}) {
  logger.info(`Voice event: ${event}`, {
    userId,
    guildId,
    event,
    ...metadata,
  });
}

function logInteraction(level, message, context = {}) {
  logger[level](message, context);
}

function logCommand(command, userId, guildId, success = true, error = null) {
  const level = success ? 'info' : 'error';
  const message = `Command executed: ${command}`;
  const context = {
    userId,
    guildId,
    success,
    ...(error && { error: error.message || error }),
  };
  logger[level](message, context);
}

module.exports = {
  error: logger.error.bind(logger),
  warn: logger.warn.bind(logger),
  info: logger.info.bind(logger),
  debug: logger.debug.bind(logger),
  logVoiceEvent,
  logInteraction,
  logCommand
};
