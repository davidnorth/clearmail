const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

let currentLevel = 'info';
let currentFormat = 'plain';

export function configureLogger({ level, format }) {
  if (level && LEVELS[level] !== undefined) currentLevel = level;
  if (format) currentFormat = format;
}

function shouldLog(level) {
  return LEVELS[level] >= LEVELS[currentLevel];
}

function formatMessage(level, message, data) {
  const timestamp = new Date().toISOString();
  if (currentFormat === 'json') {
    return JSON.stringify({ timestamp, level, message, ...(data ? { data } : {}) });
  }
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  if (data) {
    return `${prefix} ${message} ${JSON.stringify(data)}`;
  }
  return `${prefix} ${message}`;
}

function write(level, message, data) {
  if (!shouldLog(level)) return;
  const line = formatMessage(level, message, data);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function raw(line) {
  console.log(line);
}

export const logger = {
  debug: (message, data) => write('debug', message, data),
  info: (message, data) => write('info', message, data),
  warn: (message, data) => write('warn', message, data),
  error: (message, data) => write('error', message, data),
  raw: (line) => raw(line),
};
