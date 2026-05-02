import type { LogLevel, PluginLogger } from '../types/index.js';

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

function shouldLog(configured: LogLevel, incoming: LogLevel): boolean {
  return LEVELS.indexOf(incoming) >= LEVELS.indexOf(configured);
}

function timestamp(): string {
  return new Date().toISOString();
}

export class Logger implements PluginLogger {
  constructor(
    private readonly scope: string,
    private readonly level: LogLevel = 'info',
  ) {}

  debug(msg: string, ...args: unknown[]): void {
    if (shouldLog(this.level, 'debug')) console.debug(`${timestamp()} DEBUG [${this.scope}] ${msg}`, ...args);
  }

  info(msg: string, ...args: unknown[]): void {
    if (shouldLog(this.level, 'info')) console.info(`${timestamp()} INFO  [${this.scope}] ${msg}`, ...args);
  }

  warn(msg: string, ...args: unknown[]): void {
    if (shouldLog(this.level, 'warn')) console.warn(`${timestamp()} WARN  [${this.scope}] ${msg}`, ...args);
  }

  error(msg: string, ...args: unknown[]): void {
    if (shouldLog(this.level, 'error')) console.error(`${timestamp()} ERROR [${this.scope}] ${msg}`, ...args);
  }

  child(scope: string): Logger {
    return new Logger(`${this.scope}:${scope}`, this.level);
  }
}
