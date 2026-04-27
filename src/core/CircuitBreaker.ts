import type { Logger } from "../interfaces/index.js";

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
	/** Number of consecutive failures before opening the circuit. */
	failureThreshold?: number;
	/** Number of consecutive successes in half-open state to close. */
	successThreshold?: number;
	/** Time in ms the circuit stays open before transitioning to half-open. */
	resetTimeoutMs?: number;
	/** Logger instance for state change notifications. */
	logger?: Logger;
}

/**
 * Circuit breaker for fault tolerance.
 *
 * States:
 * - **closed**: Normal operation, calls pass through.
 * - **open**: Failures exceeded threshold, calls are rejected immediately.
 * - **half-open**: After resetTimeout, a limited number of trial calls are allowed.
 */
export class CircuitBreaker {
	private state: CircuitState = "closed";
	private failureCount = 0;
	private successCount = 0;
	private lastFailureTime = 0;

	private readonly failureThreshold: number;
	private readonly successThreshold: number;
	private readonly resetTimeoutMs: number;
	private readonly logger?: Logger | undefined;

	constructor(options: CircuitBreakerOptions = {}) {
		this.failureThreshold = options.failureThreshold ?? 5;
		this.successThreshold = options.successThreshold ?? 2;
		this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
		this.logger = options.logger;
	}

	/**
	 * Execute an operation through the circuit breaker.
	 *
	 * @param fn - The operation to execute.
	 * @param fallback - Optional fallback to invoke when the circuit is open.
	 * @returns The operation result or fallback result.
	 */
	async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T> | T): Promise<T> {
		if (this.state === "open") {
			if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
				this.transition("half-open");
			} else if (fallback) {
				return await fallback();
			} else {
				throw new CircuitOpenError(this.resetTimeoutMs);
			}
		}

		try {
			const result = await fn();
			this.onSuccess();
			return result;
		} catch (error) {
			this.onFailure();
			throw error;
		}
	}

	getState(): CircuitState {
		return this.state;
	}

	getFailureCount(): number {
		return this.failureCount;
	}

	/** Force the circuit closed. Useful for manual reset. */
	reset(): void {
		this.transition("closed");
	}

	private onSuccess(): void {
		if (this.state === "half-open") {
			this.successCount++;
			if (this.successCount >= this.successThreshold) {
				this.transition("closed");
			}
		} else if (this.state === "closed") {
			this.failureCount = 0;
		}
	}

	private onFailure(): void {
		this.lastFailureTime = Date.now();
		if (this.state === "half-open") {
			this.transition("open");
			return;
		}
		this.failureCount++;
		if (this.failureCount >= this.failureThreshold) {
			this.transition("open");
		}
	}

	private transition(newState: CircuitState): void {
		const oldState = this.state;
		if (oldState === newState) return;
		this.state = newState;
		if (newState === "closed") {
			this.failureCount = 0;
			this.successCount = 0;
		} else if (newState === "half-open") {
			this.successCount = 0;
		}
		const level = oldState === "half-open" && newState === "closed" ? "info" : "warn";
		this.logger?.[level]("Circuit breaker state change", {
			from: oldState,
			to: newState,
			failureCount: this.failureCount,
		});
	}
}

export class CircuitOpenError extends Error {
	constructor(public readonly resetTimeoutMs: number) {
		super(`Circuit is open. Will reset after ${resetTimeoutMs}ms of no failures.`);
		this.name = "CircuitOpenError";
	}
}
