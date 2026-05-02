import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EventEmitter, EventFilters, Logger } from '@reaatech/secret-rotation-types';
import type { RotationEvent } from '@reaatech/secret-rotation-types';

export interface EventStoreOptions {
  /** Directory for persisted events. */
  baseDir: string;
  /** Maximum events to keep in memory. */
  maxInMemory?: number;
  /** If true, persist to disk on every emit. */
  persistOnWrite?: boolean;
  /** Optional logger. */
  logger?: Logger;
}

/** File permissions: owner read/write only. */
const FILE_MODE = 0o600;
/** Directory permissions: owner read/write/execute. */
const DIR_MODE = 0o700;

/**
 * Event store that buffers events in memory and persists to disk.
 *
 * By default, events are persisted immediately on every emit to prevent data loss.
 * Set `persistOnWrite: false` to batch writes at 1-second intervals for higher
 * throughput, at the cost of potentially losing up to 1 second of events on crash.
 *
 * Events are appended to daily log files in JSON-lines format. The store
 * implements the EventEmitter interface so it can substitute for
 * InMemoryEventEmitter in tests or local dev.
 */
export class EventStore implements EventEmitter {
  private events: RotationEvent[] = [];
  private handlers: Map<string, Set<(event: RotationEvent) => void | Promise<void>>> = new Map();
  private readonly baseDir: string;
  private readonly maxInMemory: number;
  private readonly persistOnWrite: boolean;
  private writeBuffer: RotationEvent[] = [];
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly flushIntervalMs = 1000;
  private logger: Logger | undefined;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: EventStoreOptions) {
    this.baseDir = options.baseDir;
    this.maxInMemory = options.maxInMemory ?? 10_000;
    this.persistOnWrite = options.persistOnWrite ?? true;
    this.logger = options.logger;
  }

  async emit(event: RotationEvent): Promise<void> {
    this.events.push(event);
    if (this.events.length > this.maxInMemory) {
      this.events = this.events.slice(-this.maxInMemory);
    }

    if (this.persistOnWrite) {
      await this.persistEvent(event);
    } else {
      this.writeBuffer.push(event);
      this.scheduleFlush();
    }

    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      await Promise.allSettled(
        Array.from(typeHandlers).map(async (h) => {
          await h(event);
        }),
      );
    }
  }

  on(eventType: string, handler: (event: RotationEvent) => void | Promise<void>): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)?.add(handler);
  }

  off(eventType: string, handler: (event: RotationEvent) => void | Promise<void>): void {
    this.handlers.get(eventType)?.delete(handler);
  }

  async *replay(fromTime: Date, filters?: EventFilters): AsyncIterable<RotationEvent> {
    for (const event of this.events) {
      if (event.timestamp < fromTime) continue;
      if (filters?.eventType && event.type !== filters.eventType) continue;
      if (filters?.secretName && 'secretName' in event && event.secretName !== filters.secretName)
        continue;
      yield event;
    }
  }

  /** Force-flush any buffered events to disk. */
  async flush(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    if (this.writeBuffer.length === 0) return;
    const batch = this.writeBuffer;
    this.writeBuffer = [];
    await this.persistBatch(batch);
  }

  /** Load events from a date's event file. */
  async loadForDate(date: Date): Promise<RotationEvent[]> {
    const fileName = this.dateFileName(date);
    try {
      const data = await readFile(join(this.baseDir, fileName), 'utf-8');
      const events: RotationEvent[] = [];
      for (const line of data.split('\n')) {
        if (line.length === 0) continue;
        try {
          events.push(JSON.parse(line) as RotationEvent);
        } catch {
          this.logger?.warn('Skipping corrupted event line', { file: fileName });
        }
      }
      return events;
    } catch {
      return [];
    }
  }

  /** Number of events currently in memory. */
  get eventCount(): number {
    return this.events.length;
  }

  /** Clear all in-memory events and handlers. */
  clear(): void {
    this.events = [];
    this.writeBuffer = [];
    this.handlers.clear();
  }

  /** Stop the flush timer and release resources. */
  destroy(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    this.events = [];
    this.writeBuffer = [];
    this.handlers.clear();
  }

  private scheduleFlush(): void {
    if (this.writeTimer || this.writeBuffer.length === 0) return;
    this.writeTimer = setTimeout(() => {
      const batch = [...this.writeBuffer];
      this.writeBuffer = [];
      this.writeTimer = null;
      this.persistBatch(batch).catch((error) => {
        this.logger?.warn('Batch persistence failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.flushIntervalMs);
  }

  private async persistEvent(event: RotationEvent): Promise<void> {
    const done = this.writeQueue.then(() => this.persistEventInternal(event));
    this.writeQueue = done.catch(() => {});
    return done;
  }

  private async persistEventInternal(event: RotationEvent): Promise<void> {
    await mkdir(this.baseDir, { recursive: true, mode: DIR_MODE });
    const filePath = join(this.baseDir, this.dateFileName(new Date()));
    const line = `${JSON.stringify(event)}\n`;
    try {
      await writeFile(filePath, line, { flag: 'a', mode: FILE_MODE });
    } catch (error) {
      this.logger?.warn('Event persistence failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async persistBatch(events: RotationEvent[]): Promise<void> {
    const done = this.writeQueue.then(() => this.persistBatchInternal(events));
    this.writeQueue = done.catch(() => {});
    return done;
  }

  private async persistBatchInternal(events: RotationEvent[]): Promise<void> {
    await mkdir(this.baseDir, { recursive: true, mode: DIR_MODE });
    const filePath = join(this.baseDir, this.dateFileName(new Date()));
    const lines = `${events.map((e) => JSON.stringify(e)).join('\n')}\n`;
    try {
      await writeFile(filePath, lines, { flag: 'a', mode: FILE_MODE });
    } catch (error) {
      this.logger?.warn('Batch persistence failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private dateFileName(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `events-${y}-${m}-${d}.jsonl`;
  }
}
