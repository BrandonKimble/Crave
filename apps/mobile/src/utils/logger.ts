/* eslint-disable no-console */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const shouldLogDebug = __DEV__;

const log = (level: LogLevel, message: string, metadata?: unknown) => {
  const payload = metadata
    ? [`[${level.toUpperCase()}] ${message}`, metadata]
    : [`[${level.toUpperCase()}] ${message}`];

  switch (level) {
    case 'debug':
      if (shouldLogDebug) {
        console.debug(...payload);
      }
      break;
    case 'info':
      console.info(...payload);
      break;
    case 'warn':
      console.warn(...payload);
      break;
    case 'error':
      console.error(...payload);
      break;
    default:
      console.log(...payload);
  }
};

export const logger = {
  debug: (message: string, metadata?: unknown) => log('debug', message, metadata),
  info: (message: string, metadata?: unknown) => log('info', message, metadata),
  warn: (message: string, metadata?: unknown) => log('warn', message, metadata),
  error: (message: string, metadata?: unknown) => log('error', message, metadata),
};
