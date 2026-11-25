/**
 * Centralized Multi-App Logger SDK
 * Lightweight, asynchronous, buffer-batched logging client.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical' | 'audit';

export interface LogEvent {
  level?: LogLevel;
  category: string;
  action: string;
  title: string;
  message?: string;
  storeId?: number | null;
  phone?: string | null;
  metadata?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface LoggerConfig {
  appId: string;
  apiKey: string;
  endpoint: string; // e.g. "/api/v1/logs/ingest" or full URL
  batchSize?: number;
  flushIntervalMs?: number;
}

export class AppLogger {
  private config: LoggerConfig;
  private queue: LogEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;

  constructor(config: LoggerConfig) {
    this.config = config;
  }

  public log(event: LogEvent): void {
    const fullEvent: LogEvent = {
      level: 'info',
      ...event,
      context: {
        ...this.getAutoContext(),
        ...event.context,
      },
    };

    this.queue.push(fullEvent);

    // Immediate flush for error, critical, audit, or user operations
    if (
      fullEvent.level === 'error' ||
      fullEvent.level === 'critical' ||
      fullEvent.level === 'audit' ||
      fullEvent.category === 'operation' ||
      fullEvent.category === 'invoice' ||
      fullEvent.category === 'sync' ||
      fullEvent.category === 'backup' ||
      fullEvent.category === 'auth' ||
      fullEvent.category === 'inventory'
    ) {
      void this.flush();
      return;
    }

    if (this.queue.length >= (this.config.batchSize ?? 20)) {
      void this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(), this.config.flushIntervalMs ?? 3000);
    }
  }

  public info(category: string, action: string, title: string, meta?: Record<string, unknown>): void {
    this.log({ level: 'info', category, action, title, metadata: meta });
  }

  public warn(category: string, action: string, title: string, meta?: Record<string, unknown>): void {
    this.log({ level: 'warn', category, action, title, metadata: meta });
  }

  public audit(category: string, action: string, title: string, meta?: Record<string, unknown>): void {
    this.log({ level: 'audit', category, action, title, metadata: meta });
  }

  public error(
    category: string,
    action: string,
    title: string,
    err: unknown,
    meta?: Record<string, unknown>
  ): void {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    this.log({
      level: 'error',
      category,
      action,
      title,
      message,
      metadata: { ...meta, stack },
    });
  }

  public critical(
    category: string,
    action: string,
    title: string,
    err: unknown,
    meta?: Record<string, unknown>
  ): void {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    this.log({
      level: 'critical',
      category,
      action,
      title,
      message,
      metadata: { ...meta, stack },
    });
  }

  public async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.queue.length === 0 || this.isFlushing) return;
    const runtimeProcess = (globalThis as typeof globalThis & {
      process?: { env?: { NODE_ENV?: string } };
    }).process;
    if (runtimeProcess?.env?.NODE_ENV === 'test' || import.meta.env?.MODE === 'test') {
      this.queue = [];
      return;
    }

    this.isFlushing = true;
    const itemsToSend = [...this.queue];
    this.queue = [];

    try {
      await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Id': this.config.appId,
          'X-App-Token': this.config.apiKey,
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({ events: itemsToSend }),
        signal: typeof AbortSignal !== 'undefined' ? AbortSignal.timeout(4000) : undefined,
      });
    } catch (e) {
      // In case of network failure, keep last 50 items in memory to retry
      const errMsg = e instanceof Error ? e.message : String(e);
      console.warn('[AppLogger] Flush failed:', errMsg);
      this.queue = [...itemsToSend.slice(-50), ...this.queue];
    } finally {
      this.isFlushing = false;
    }
  }

  private getAutoContext(): Record<string, unknown> {
    if (typeof window === 'undefined') {
      return { runtime: 'node' };
    }
    return {
      runtime: 'browser',
      path: window.location.pathname,
      search: window.location.search,
      device: navigator.userAgent,
      screenWidth: window.screen?.width,
      screenHeight: window.screen?.height,
      online: navigator.onLine,
    };
  }
}

// Global default singleton for Tanzim App
export const appLogger = new AppLogger({
  appId: 'tanzim-app',
  apiKey: 'tzm_app_live_8f93e2b10a4c9d',
  endpoint: '/api/v1/logs/ingest',
});
