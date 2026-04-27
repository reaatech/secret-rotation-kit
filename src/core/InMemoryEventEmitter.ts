import type { EventEmitter, EventFilters, EventHandler } from "../interfaces/index.js";
import type { RotationEvent } from "../types/index.js";

/** Default maximum number of events retained in history. */
const DEFAULT_MAX_HISTORY = 1000;

/** Options for InMemoryEventEmitter. */
export interface InMemoryEventEmitterOptions {
	/** Maximum events to retain for replay. Older events are dropped. Default 1000. */
	maxHistory?: number;
}

/**
 * In-memory event bus with bounded per-event-type replay.
 *
 * Stores up to `maxHistory` recent events in memory. Useful for local observation,
 * debugging, and testing. Not suitable for distributed systems.
 */
export class InMemoryEventEmitter implements EventEmitter {
	private handlers: Map<string, Set<EventHandler>> = new Map();
	private history: RotationEvent[] = [];
	private readonly maxHistory: number;

	constructor(options: InMemoryEventEmitterOptions = {}) {
		this.maxHistory = options.maxHistory ?? DEFAULT_MAX_HISTORY;
	}

	async emit(event: RotationEvent): Promise<void> {
		this.history.push(event);
		if (this.history.length > this.maxHistory) {
			this.history.splice(0, this.history.length - this.maxHistory);
		}

		const typeHandlers = this.handlers.get(event.type);
		if (!typeHandlers) return;

		// Execute all handlers concurrently; don't let one failure stop others.
		await Promise.allSettled(
			Array.from(typeHandlers).map(async (handler) => {
				await handler(event);
			}),
		);
	}

	on(eventType: string, handler: EventHandler): void {
		if (!this.handlers.has(eventType)) {
			this.handlers.set(eventType, new Set());
		}
		this.handlers.get(eventType)?.add(handler);
	}

	off(eventType: string, handler: EventHandler): void {
		this.handlers.get(eventType)?.delete(handler);
	}

	async *replay(fromTime: Date, filters?: EventFilters): AsyncIterable<RotationEvent> {
		for (const event of this.history) {
			if (event.timestamp < fromTime) continue;
			if (filters?.eventType && event.type !== filters.eventType) continue;
			if (filters?.secretName && "secretName" in event && event.secretName !== filters.secretName)
				continue;
			yield event;
		}
	}

	/** Clear all handlers and history. Useful for testing. */
	clear(): void {
		this.handlers.clear();
		this.history = [];
	}
}
