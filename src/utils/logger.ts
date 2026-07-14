/**
 * Production-safe logging utility
 * Only logs in development mode, silent in production
 */

const isDevelopment = __DEV__ || process.env.NODE_ENV === 'development';

export const Logger = {
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log('[LOG]', ...args);
    }
  },

  info: (...args: any[]) => {
    if (isDevelopment) {
      console.info('[INFO]', ...args);
    }
  },

  warn: (...args: any[]) => {
    if (isDevelopment) {
      console.warn('[WARN]', ...args);
    }
  },

  error: (...args: any[]) => {
    // Always log errors, even in production
    console.error('[ERROR]', ...args);
  },

  debug: (...args: any[]) => {
    if (isDevelopment) {
      console.debug('[DEBUG]', ...args);
    }
  },

  // Business logic logging (only in development)
  business: (event: string, data?: any) => {
    if (isDevelopment) {
      console.log(`[BUSINESS] ${event}:`, data);
    }
  },

  // Analytics logging (can be enabled in production)
  analytics: (event: string, data?: any) => {
    if (isDevelopment) {
      console.log(`[ANALYTICS] ${event}:`, data);
    }
    // In production, this would send to analytics service
  },

  // Performance logging
  performance: (label: string, fn: () => void) => {
    if (isDevelopment) {
      console.time(`[PERF] ${label}`);
      fn();
      console.timeEnd(`[PERF] ${label}`);
    } else {
      fn();
    }
  }
};

export default Logger;