/**
 * Logger utility — thin wrapper around console with log levels.
 * In production, info logs are suppressed unless DEBUG=1 is set.
 */

const isDev = process.env.NODE_ENV !== "production";
const isDebug = Boolean(process.env.DEBUG);

export const logger = {
  info: (msg: string, ...args: unknown[]) => {
    if (isDev || isDebug) {
      console.log(`[INFO]  ${new Date().toISOString()} ${msg}`, ...args);
    }
  },
  warn: (msg: string, ...args: unknown[]) => {
    console.warn(`[WARN]  ${new Date().toISOString()} ${msg}`, ...args);
  },
  error: (msg: string, ...args: unknown[]) => {
    console.error(`[ERROR] ${new Date().toISOString()} ${msg}`, ...args);
  },
  debug: (msg: string, ...args: unknown[]) => {
    if (isDebug) {
      console.debug(`[DEBUG] ${new Date().toISOString()} ${msg}`, ...args);
    }
  },
};
