import { describe, expect, it, vi } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  it('executes normally when closed', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    const result = await cb.execute(async () => 'ok');
    expect(result).toBe('ok');
    expect(cb.getState()).toBe('closed');
  });

  it('opens after failure threshold exceeded', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 10_000 });
    const fn = async () => {
      throw new Error('fail');
    };

    await expect(cb.execute(fn)).rejects.toThrow('fail');
    expect(cb.getState()).toBe('closed');
    await expect(cb.execute(fn)).rejects.toThrow('fail');
    expect(cb.getState()).toBe('open');
  });

  it('throws CircuitOpenError when open', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 10_000 });
    const fn = async () => {
      throw new Error('fail');
    };

    await expect(cb.execute(fn)).rejects.toThrow('fail');
    expect(cb.getState()).toBe('open');

    await expect(cb.execute(fn)).rejects.toThrow(CircuitOpenError);
  });

  it('uses fallback when open', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 10_000 });
    const fn = async () => {
      throw new Error('fail');
    };

    await expect(cb.execute(fn)).rejects.toThrow('fail');
    const result = await cb.execute(fn, async () => 'fallback');
    expect(result).toBe('fallback');
  });

  it('transitions to half-open and closes on success', async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      successThreshold: 2,
      resetTimeoutMs: 10,
    });
    const failingFn = async () => {
      throw new Error('fail');
    };

    await expect(cb.execute(failingFn)).rejects.toThrow('fail');
    expect(cb.getState()).toBe('open');

    await new Promise((r) => setTimeout(r, 20));

    const result = await cb.execute(async () => 'ok');
    expect(result).toBe('ok');
    expect(cb.getState()).toBe('half-open');

    const result2 = await cb.execute(async () => 'ok');
    expect(result2).toBe('ok');
    expect(cb.getState()).toBe('closed');
  });

  it('reopens on failure in half-open state', async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      successThreshold: 2,
      resetTimeoutMs: 10,
    });
    const failingFn = async () => {
      throw new Error('fail');
    };

    await expect(cb.execute(failingFn)).rejects.toThrow('fail');
    expect(cb.getState()).toBe('open');

    await new Promise((r) => setTimeout(r, 20));

    await expect(cb.execute(failingFn)).rejects.toThrow('fail');
    expect(cb.getState()).toBe('open');
  });

  it('manual reset closes the circuit', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 10_000 });
    await expect(
      cb.execute(async () => {
        throw new Error('fail');
      }),
    ).rejects.toThrow('fail');
    expect(cb.getState()).toBe('open');

    cb.reset();
    expect(cb.getState()).toBe('closed');
    expect(cb.getFailureCount()).toBe(0);
  });

  it('tracks failure count', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 5 });
    for (let i = 0; i < 4; i++) {
      await expect(
        cb.execute(async () => {
          throw new Error('fail');
        }),
      ).rejects.toThrow('fail');
    }
    expect(cb.getState()).toBe('closed');
    expect(cb.getFailureCount()).toBe(4);
  });

  it('logs state transitions when logger provided', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 10_000, logger });

    await expect(
      cb.execute(async () => {
        throw new Error('fail');
      }),
    ).rejects.toThrow('fail');

    expect(logger.warn).toHaveBeenCalledWith(
      'Circuit breaker state change',
      expect.objectContaining({ from: 'closed', to: 'open' }),
    );
  });
});
