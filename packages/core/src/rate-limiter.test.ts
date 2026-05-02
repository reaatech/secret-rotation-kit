import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimitError, RateLimiter } from './rate-limiter.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows initial requests up to max requests', () => {
    const limiter = new RateLimiter(3, 60_000);
    limiter.consume('key1');
    limiter.consume('key1');
    limiter.consume('key1');
  });

  it('throws RateLimitError after exceeding limit', () => {
    const limiter = new RateLimiter(2, 60_000);
    limiter.consume('key1');
    limiter.consume('key1');
    expect(() => limiter.consume('key1')).toThrow(RateLimitError);
  });

  it('tracks separate buckets per key', () => {
    const limiter = new RateLimiter(1, 60_000);
    limiter.consume('key1');
    limiter.consume('key2');
    expect(() => limiter.consume('key1')).toThrow(RateLimitError);
  });

  it('canConsume checks without consuming', () => {
    const limiter = new RateLimiter(1, 60_000);
    expect(limiter.canConsume('key1')).toBe(true);
    limiter.consume('key1');
    expect(limiter.canConsume('key1')).toBe(false);
  });

  it('reset clears all buckets', () => {
    const limiter = new RateLimiter(1, 60_000);
    limiter.consume('key1');
    limiter.reset();
    expect(() => limiter.consume('key1')).not.toThrow();
  });

  it('destroy cleans up timer', () => {
    const limiter = new RateLimiter(1, 60_000);
    limiter.destroy();
  });

  it('refills tokens after time passes', () => {
    const limiter = new RateLimiter(2, 10_000);

    limiter.consume('key1');
    limiter.consume('key1');
    expect(() => limiter.consume('key1')).toThrow(RateLimitError);

    vi.advanceTimersByTime(10_000);

    limiter.consume('key1');
  });

  it('does not exceed maxTokens after refill', () => {
    const limiter = new RateLimiter(2, 10_000);

    limiter.consume('key1');
    limiter.consume('key1');

    vi.advanceTimersByTime(60_000);

    limiter.consume('key1');
    limiter.consume('key1');
    expect(() => limiter.consume('key1')).toThrow(RateLimitError);
  });

  it('partial refill grants fewer tokens after shorter delay', () => {
    const limiter = new RateLimiter(4, 10_000);

    limiter.consume('key1');
    limiter.consume('key1');
    limiter.consume('key1');
    limiter.consume('key1');
    expect(() => limiter.consume('key1')).toThrow(RateLimitError);

    vi.advanceTimersByTime(2_500);

    limiter.consume('key1');
    expect(() => limiter.consume('key1')).toThrow(RateLimitError);
  });
});
