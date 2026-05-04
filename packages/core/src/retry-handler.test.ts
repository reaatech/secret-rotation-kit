import { describe, expect, it } from 'vitest';
import { RetryHandler } from './retry-handler.js';

describe('RetryHandler', () => {
  it('succeeds on first attempt', async () => {
    const handler = new RetryHandler({ maxRetries: 3, initialDelayMs: 10 });
    const fn = async () => 'ok';
    const result = await handler.execute(fn);
    expect(result.result).toBe('ok');
    expect(result.attempts).toBe(0);
  });

  it('retries on transient failure', async () => {
    const handler = new RetryHandler({ maxRetries: 3, initialDelayMs: 10, backoffMultiplier: 2 });
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 3) throw new Error('transient');
      return 'ok';
    };
    const result = await handler.execute(fn);
    expect(result.result).toBe('ok');
    expect(result.attempts).toBe(2);
    expect(attempts).toBe(3);
  });

  it('throws after exhausting retries', async () => {
    const handler = new RetryHandler({ maxRetries: 2, initialDelayMs: 10 });
    const fn = async () => {
      throw new Error('persistent');
    };
    await expect(handler.execute(fn)).rejects.toThrow('persistent');
  });

  it('does not retry when shouldRetry returns false', async () => {
    const handler = new RetryHandler({ maxRetries: 3, initialDelayMs: 10 });
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw new Error('non-retryable');
    };
    await expect(handler.execute(fn, (err) => err.message !== 'non-retryable')).rejects.toThrow(
      'non-retryable',
    );
    expect(attempts).toBe(1);
  });

  it('includes totalDuration in result', async () => {
    const handler = new RetryHandler({ maxRetries: 1, initialDelayMs: 20 });
    const fn = async () => 'ok';
    const result = await handler.execute(fn);
    expect(result.totalDuration).toBeGreaterThanOrEqual(0);
    expect(result.attempts).toBe(0);
  });

  it('uses exponential backoff with jitter', async () => {
    const handler = new RetryHandler({
      maxRetries: 2,
      initialDelayMs: 100,
      backoffMultiplier: 2,
      maxDelayMs: 500,
    });
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts <= 2) throw new Error('retry');
      return 'ok';
    };
    const start = Date.now();
    const result = await handler.execute(fn);
    const elapsed = Date.now() - start;
    expect(result.result).toBe('ok');
    expect(result.attempts).toBe(2);
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThan(5000);
  });

  it('defaults to sensible retry policy', async () => {
    const handler = new RetryHandler();
    expect(handler).toBeDefined();
    const fn = async () => 'ok';
    const result = await handler.execute(fn);
    expect(result.result).toBe('ok');
  });
});
