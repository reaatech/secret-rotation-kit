/**
 * Token bucket rate limiter for preventing rotation flooding.
 *
 * Each secret name gets its own bucket. Buckets refill at a configurable
 * rate. Requests that exceed capacity throw RateLimitError.
 */
export class RateLimiter {
	private buckets: Map<string, TokenBucket> = new Map();
	private readonly maxTokens: number;
	private readonly refillRatePerMs: number;
	private cleanupTimer: ReturnType<typeof setInterval>;

	/**
	 * @param maxRequests - Maximum burst requests per secret.
	 * @param windowMs - Time window for the bucket refill in ms.
	 */
	constructor(maxRequests = 5, windowMs = 60_000) {
		this.maxTokens = maxRequests;
		this.refillRatePerMs = maxRequests / windowMs;
		this.cleanupTimer = setInterval(() => this.cleanup(), windowMs);
		if (this.cleanupTimer.unref) this.cleanupTimer.unref();
	}

	/**
	 * Consume one token for the given key. Throws if none available.
	 */
	consume(name: string): void {
		const now = Date.now();
		let bucket = this.buckets.get(name);

		if (!bucket) {
			bucket = { tokens: this.maxTokens - 1, lastRefill: now };
			this.buckets.set(name, bucket);
			return;
		}

		this.refill(bucket, now);

		if (bucket.tokens < EPSILON) {
			throw new RateLimitError(name, this.maxTokens, bucket.lastRefill);
		}

		bucket.tokens--;
	}

	/**
	 * Check if a token is available without consuming it.
	 */
	canConsume(name: string): boolean {
		const now = Date.now();
		const bucket = this.buckets.get(name);
		if (!bucket) return true;
		this.refill(bucket, now);
		return bucket.tokens >= EPSILON;
	}

	/**
	 * Reset all buckets. Useful for testing.
	 */
	reset(): void {
		this.buckets.clear();
	}

	/**
	 * Destroy the rate limiter, clearing the cleanup timer.
	 */
	destroy(): void {
		clearInterval(this.cleanupTimer);
	}

	private refill(bucket: TokenBucket, now: number): void {
		const elapsed = now - bucket.lastRefill;
		if (elapsed <= 0) return;
		const refill = elapsed * this.refillRatePerMs;
		bucket.tokens = Math.min(this.maxTokens, bucket.tokens + refill);
		bucket.lastRefill = now;
	}

	private cleanup(): void {
		const now = Date.now();
		const stale = 10 * 60 * 1000; // 10 minutes
		for (const [key, bucket] of this.buckets) {
			if (now - bucket.lastRefill > stale) {
				this.buckets.delete(key);
			}
		}
	}
}

interface TokenBucket {
	tokens: number;
	lastRefill: number;
}

const EPSILON = 1e-9;

export class RateLimitError extends Error {
	constructor(
		public readonly key: string,
		public readonly maxRequests: number,
		public readonly lastRefill: number,
	) {
		super(`Rate limit exceeded for "${key}". Try again later.`);
		this.name = "RateLimitError";
	}
}
