export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface LogContext {
  component?: string;
  requestId?: string;
  duration?: number;
  [key: string]: unknown;
}

/*
 * this is the eyes of our application. in production we cannot just use 
 * console.log because it's hard to search. i built this structured logger 
 * to output json so tools like datadog or elasticsearch can parse it 
 * easily. it also automatically hides passwords and tokens so we 
 * do not accidentally leak secrets into our logs.
 */
class Logger {
  private minLevel: LogLevel = LogLevel.INFO;

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, context);
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (this.shouldSkip(level)) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.sanitize(context || {}),
    };

    const output = JSON.stringify(logEntry);

    if (level === LogLevel.ERROR) console.error(output);
    else if (level === LogLevel.WARN) console.warn(output);
    else console.log(output);
  }

  /*
   * very important safety feature. it scans our logs for keys like 
   * "password" or "token" and replaces them with [redacted].
   */
  private sanitize(context: LogContext): LogContext {
    const sanitized: LogContext = {};

    for (const [key, value] of Object.entries(context)) {
      if (this.isSensitiveKey(key)) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitize(value as LogContext);
        continue;
      }

      sanitized[key] = value;
    }
    return sanitized;
  }

  private isSensitiveKey(key: string): boolean {
    const sensitivePatterns = ['token', 'password', 'secret', 'auth', 'key'];
    const lowerKey = key.toLowerCase();
    return sensitivePatterns.some((pattern) => lowerKey.includes(pattern));
  }

  private shouldSkip(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) < levels.indexOf(this.minLevel);
  }
}

export const logger = new Logger();