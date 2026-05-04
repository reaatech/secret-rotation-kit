import type { Logger } from '@reaatech/secret-rotation-types';

const LEVEL_WEIGHT: Record<'debug' | 'info' | 'warn' | 'error', number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LoggerOptions {
  level?: 'debug' | 'info' | 'warn' | 'error';
  structured?: boolean;
  stream?: NodeJS.WritableStream;
  getTimestamp?: () => string;
}

interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

export class LoggerService implements Logger {
  private readonly minLevel: number;
  private readonly structured: boolean;
  private readonly stream: NodeJS.WritableStream;
  private readonly getTimestamp: () => string;

  constructor(options: LoggerOptions = {}) {
    this.minLevel = LEVEL_WEIGHT[options.level ?? 'info'];
    this.structured = options.structured ?? true;
    this.stream = options.stream ?? process.stderr;
    this.getTimestamp = options.getTimestamp ?? (() => new Date().toISOString());
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta);
  }

  child(defaults: Record<string, unknown>): Logger {
    return {
      debug: (msg: string, meta?: Record<string, unknown>) =>
        this.debug(msg, { ...defaults, ...meta }),
      info: (msg: string, meta?: Record<string, unknown>) =>
        this.info(msg, { ...defaults, ...meta }),
      warn: (msg: string, meta?: Record<string, unknown>) =>
        this.warn(msg, { ...defaults, ...meta }),
      error: (msg: string, meta?: Record<string, unknown>) =>
        this.error(msg, { ...defaults, ...meta }),
    };
  }

  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    if (LEVEL_WEIGHT[level] < this.minLevel) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: this.getTimestamp(),
      ...(meta !== undefined && Object.keys(meta).length > 0 && { meta }),
    };

    const line = this.structured
      ? JSON.stringify(entry)
      : `${entry.timestamp} [${entry.level.toUpperCase()}] ${message}${meta ? ` ${JSON.stringify(meta)}` : ''}`;

    this.stream.write(`${line}\n`);
  }
}
