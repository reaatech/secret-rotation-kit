import type { RetryPolicy } from "../types/verification.js";

/** Default retry policy. */
const DEFAULT_POLICY: RetryPolicy = {
	maxRetries: 3,
	backoffMultiplier: 2,
	initialDelayMs: 1000,
	maxDelayMs: 30_000,
};

export type Retryable<T> = () => Promise<T>;

export interface RetryResult<T> {
	result: T;
	attempts: number;
	totalDuration: number;
}

/**
 * Executes an operation with exponential backoff retry.
 *
 * Applies full jitter to prevent thundering herd. Retries are only attempted
 * when the operation throws — transient vs non-transient is determined by a
 * caller-provided `shouldRetry` predicate.
 */
export class RetryHandler {
	private policy: RetryPolicy;

	constructor(policy?: Partial<RetryPolicy>) {
		this.policy = { ...DEFAULT_POLICY, ...policy };
	}

	/**
	 * Execute an operation with retry logic.
	 *
	 * @param fn - The operation to retry.
	 * @param shouldRetry - Predicate: return true if the error is transient.
	 * @returns The operation result and retry metadata.
	 */
	async execute<T>(
		fn: Retryable<T>,
		shouldRetry: (error: Error) => boolean = () => true,
	): Promise<RetryResult<T>> {
		const startTime = Date.now();
		let lastError: Error | undefined;

		for (let attempt = 0; attempt <= this.policy.maxRetries; attempt++) {
			try {
				const result = await fn();
				return {
					result,
					attempts: attempt,
					totalDuration: Date.now() - startTime,
				};
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				if (attempt === this.policy.maxRetries || !shouldRetry(lastError)) {
					throw lastError;
				}
				await this.delay(attempt);
			}
		}

		throw lastError;
	}

	/** Calculate the delay for a given attempt (0-based). */
	private async delay(attempt: number): Promise<void> {
		const baseDelay = this.policy.initialDelayMs * this.policy.backoffMultiplier ** attempt;
		const capped = Math.min(baseDelay, this.policy.maxDelayMs);
		const jittered = Math.random() * capped;
		await new Promise((resolve) => setTimeout(resolve, jittered));
	}
}
