import type { SecretProvider } from '@reaatech/secret-rotation-types';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryKeyStore } from './in-memory-key-store.js';
import { RotationManager, createRotationConfig } from './rotation-manager.js';

function createMockProvider(): SecretProvider {
  let versionCounter = 0;
  return {
    name: 'mock-provider',
    priority: 1,
    createSecret: vi.fn(),
    getSecret: vi.fn(async () => ({
      value: 'secret',
      versionId: `v${versionCounter}`,
      createdAt: new Date(),
    })),
    storeSecretValue: vi.fn(async (_name, value, _options) => {
      const v = `v${++versionCounter}`;
      return { value, versionId: v, createdAt: new Date() };
    }),
    deleteSecret: vi.fn(),
    listVersions: vi.fn(),
    getVersion: vi.fn(),
    deleteVersion: vi.fn(),
    supportsRotation: vi.fn(() => true),
    beginRotation: vi.fn(async (name) => ({
      sessionId: `session-${++versionCounter}`,
      secretName: name,
      provider: 'mock-provider',
      state: { versionId: `v${versionCounter}` },
      startedAt: new Date(),
    })),
    completeRotation: vi.fn(),
    cancelRotation: vi.fn(),
    health: vi.fn(async () => ({
      status: 'healthy' as const,
      latency: 10,
      lastChecked: new Date(),
    })),
    capabilities: vi.fn(() => ({
      supportsRotation: true,
      supportsVersioning: true,
      supportsLabels: false,
    })),
  };
}

describe('RotationManager', () => {
  it('rotates a secret end-to-end', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({
      providerInstance: provider,
      keyStore: new InMemoryKeyStore(),
      verifier: {
        verify: vi.fn(async () => ({
          success: true,
          consumerCount: 1,
          verifiedCount: 1,
          coverage: 1,
          duration: 100,
          failures: [],
          canRetry: false,
        })),
        getVerificationStatus: vi.fn(),
        cancelVerification: vi.fn(),
      },
    });

    const result = await manager.rotate('my-secret');

    expect(result.success).toBe(true);
    expect(result.newKeyId).toBeDefined();
    expect(result.rotationId).toMatch(/^rot-/);
  });

  it('prevents concurrent rotation of the same secret', async () => {
    const manager = new RotationManager({
      providerInstance: createMockProvider(),
      verifier: {
        verify: vi.fn(
          async () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    success: true,
                    consumerCount: 1,
                    verifiedCount: 1,
                    coverage: 1,
                    duration: 100,
                    failures: [],
                    canRetry: false,
                  }),
                100,
              ),
            ),
        ) as any,
        getVerificationStatus: vi.fn(),
        cancelVerification: vi.fn(),
      },
    });

    const first = manager.rotate('my-secret');
    await expect(manager.rotate('my-secret')).rejects.toThrow('already in progress');
    await first;
  });

  it('allows forced concurrent rotation', async () => {
    const manager = new RotationManager({
      providerInstance: createMockProvider(),
      verifier: {
        verify: vi.fn(
          async () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    success: true,
                    consumerCount: 1,
                    verifiedCount: 1,
                    coverage: 1,
                    duration: 100,
                    failures: [],
                    canRetry: false,
                  }),
                50,
              ),
            ),
        ) as any,
        getVerificationStatus: vi.fn(),
        cancelVerification: vi.fn(),
      },
    });

    const first = manager.rotate('my-secret');
    const second = manager.rotate('my-secret', { force: true });
    await expect(second).resolves.toBeDefined();
    await first;
  });

  it('starts and stops automatic rotation', async () => {
    const manager = new RotationManager({
      providerInstance: createMockProvider(),
      rotationIntervalMs: 100,
      verifier: {
        verify: vi.fn(async () => ({
          success: true,
          consumerCount: 1,
          verifiedCount: 1,
          coverage: 1,
          duration: 100,
          failures: [],
          canRetry: false,
        })),
        getVerificationStatus: vi.fn(),
        cancelVerification: vi.fn(),
      },
    });

    await manager.start(['secret-a']);

    // Wait for at least one rotation to fire
    await new Promise((r) => setTimeout(r, 250));

    await manager.stop();
  });

  it('throws when starting auto rotation without interval', async () => {
    const manager = new RotationManager({
      providerInstance: createMockProvider(),
    });

    await expect(manager.start(['secret-a'])).rejects.toThrow('rotationIntervalMs');
  });

  it('throws when starting auto rotation twice', async () => {
    const manager = new RotationManager({
      providerInstance: createMockProvider(),
      rotationIntervalMs: 1000,
    });

    await manager.start(['secret-a']);
    await expect(manager.start(['secret-a'])).rejects.toThrow('already started');
    await manager.stop();
  });

  it('exposes the event emitter', () => {
    const manager = new RotationManager({
      providerInstance: createMockProvider(),
    });

    const emitter = manager.events;
    expect(emitter).toBeDefined();
    expect(typeof emitter.emit).toBe('function');
    expect(typeof emitter.on).toBe('function');
  });

  it('exposes the provider instance', () => {
    const provider = createMockProvider();
    const manager = new RotationManager({
      providerInstance: provider,
    });

    expect(manager.providerInstance).toBe(provider);
  });

  it('logs automatic rotation failures without crashing', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const provider = createMockProvider();
    provider.beginRotation = vi.fn(async () => {
      throw new Error('provider down');
    });

    const manager = new RotationManager({
      providerInstance: provider,
      rotationIntervalMs: 100,
      verifier: {
        verify: vi.fn(),
        getVerificationStatus: vi.fn(),
        cancelVerification: vi.fn(),
      },
      logger,
    });

    await manager.start(['secret-a']);
    await new Promise((r) => setTimeout(r, 250));
    await manager.stop();

    expect(logger.error).toHaveBeenCalledWith(
      'Automatic rotation failed',
      expect.objectContaining({ secretName: 'secret-a' }),
    );
  });

  it('getState returns rotation state for a secret', async () => {
    const manager = new RotationManager({
      providerInstance: createMockProvider(),
    });

    const state = await manager.getState('my-secret');
    expect(state.secretName).toBe('my-secret');
    expect(state.activeKey).toBeNull();
    expect(state.pendingKeys).toEqual([]);
    expect(state.expiredKeys).toEqual([]);
    expect(state.revokedKeys).toEqual([]);
  });

  it('createRotationConfig fills in defaults', () => {
    const provider = createMockProvider();
    const config = createRotationConfig({
      providerInstance: provider,
    });

    expect(config.providerInstance).toBe(provider);
    expect(config.verificationTimeoutMs).toBe(30000);
    expect(config.minConsumerCoverage).toBe(1.0);
  });

  it('createRotationConfig preserves overrides', () => {
    const provider = createMockProvider();
    const config = createRotationConfig({
      providerInstance: provider,
      verificationTimeoutMs: 10000,
      minConsumerCoverage: 0.9,
    });

    expect(config.verificationTimeoutMs).toBe(10000);
    expect(config.minConsumerCoverage).toBe(0.9);
  });

  it('validates secret name on rotate when validateInputs is true', async () => {
    const manager = new RotationManager({
      providerInstance: createMockProvider(),
      validateInputs: true,
    });

    await expect(manager.rotate('')).rejects.toThrow('Secret name must not be empty');
    await expect(manager.rotate('.bad-start')).rejects.toThrow('must start with alphanumeric');
  });

  it('skips input validation when validateInputs is false', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({
      providerInstance: provider,
      validateInputs: false,
    });

    const result = await manager.rotate('.dot-prefix');
    expect(result.success).toBe(true);
  });

  it('applies rate limiting to rotation requests', async () => {
    const provider = createMockProvider();
    const slowVerifier = {
      verify: vi.fn(
        async () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  success: true,
                  consumerCount: 1,
                  verifiedCount: 1,
                  coverage: 1,
                  duration: 100,
                  failures: [],
                  canRetry: false,
                }),
              200,
            ),
          ),
      ) as any,
      getVerificationStatus: vi.fn(),
      cancelVerification: vi.fn(),
    };

    const manager = new RotationManager({
      providerInstance: provider,
      rotationIntervalMs: 10,
      verifier: slowVerifier,
    });

    // Fire many rapid rotations — rate limiter should throttle
    const promises = Array.from({ length: 10 }, () =>
      manager.rotate('rate-secret').catch(() => null),
    );
    const results = await Promise.all(promises);
    const rejected = results.filter((r) => r === null);
    expect(rejected.length).toBeGreaterThan(0);
  });

  it('invokes onRotationError callback on automatic rotation failure', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const provider = createMockProvider();
    provider.beginRotation = vi.fn(async () => {
      throw new Error('provider down');
    });

    const onError = vi.fn();

    const manager = new RotationManager({
      providerInstance: provider,
      rotationIntervalMs: 50,
      verifier: {
        verify: vi.fn(),
        getVerificationStatus: vi.fn(),
        cancelVerification: vi.fn(),
      },
      logger,
      onRotationError: onError,
    });

    await manager.start(['secret-a']);
    await new Promise((r) => setTimeout(r, 150));
    await manager.stop();

    expect(onError).toHaveBeenCalledWith(
      'secret-a',
      expect.objectContaining({ message: 'provider down' }),
    );
  });

  it('exposes the rate limiter', () => {
    const manager = new RotationManager({
      providerInstance: createMockProvider(),
    });

    expect(manager.limiter).toBeDefined();
    expect(manager.limiter.canConsume('test')).toBe(true);
  });

  it('validates secret names on start', async () => {
    const manager = new RotationManager({
      providerInstance: createMockProvider(),
      rotationIntervalMs: 1000,
    });

    await expect(manager.start(['', 'valid'])).rejects.toThrow('Secret name must not be empty');
  });

  it('validates secret name on getState', async () => {
    const manager = new RotationManager({
      providerInstance: createMockProvider(),
    });

    await expect(manager.getState('')).rejects.toThrow('Secret name must not be empty');
  });

  it('schedules rotations with drift correction', async () => {
    const manager = new RotationManager({
      providerInstance: createMockProvider(),
      rotationIntervalMs: 100,
      verifier: {
        verify: vi.fn(async () => ({
          success: true,
          consumerCount: 1,
          verifiedCount: 1,
          coverage: 1,
          duration: 100,
          failures: [],
          canRetry: false,
        })),
        getVerificationStatus: vi.fn(),
        cancelVerification: vi.fn(),
      },
    });

    await manager.start(['secret-a']);
    await new Promise((r) => setTimeout(r, 350));
    await manager.stop();
  });

  it('stop is idempotent', async () => {
    const manager = new RotationManager({
      providerInstance: createMockProvider(),
    });

    await manager.stop();
    await manager.stop();
  });

  it('throws for start with empty array', async () => {
    const manager = new RotationManager({
      providerInstance: createMockProvider(),
      rotationIntervalMs: 1000,
    });

    await expect(manager.start([])).rejects.toThrow('At least one secret name');
  });

  it('throws when no providerInstance is provided', () => {
    expect(() => new RotationManager({})).toThrow('providerInstance must be provided');
  });

  it('handles onRotationError callback that itself throws', async () => {
    const provider = createMockProvider();
    provider.beginRotation = vi.fn(async () => {
      throw new Error('provider down');
    });

    const onError = vi.fn().mockRejectedValue(new Error('callback crashed'));

    const manager = new RotationManager({
      providerInstance: provider,
      rotationIntervalMs: 50,
      verifier: {
        verify: vi.fn(),
        getVerificationStatus: vi.fn(),
        cancelVerification: vi.fn(),
      },
      onRotationError: onError,
    });

    await manager.start(['secret-a']);
    await new Promise((r) => setTimeout(r, 150));
    await manager.stop();

    expect(onError).toHaveBeenCalledWith(
      'secret-a',
      expect.objectContaining({ message: 'provider down' }),
    );
  });

  it('uses custom rate limiter from config', () => {
    const customLimiter = {
      consume: vi.fn(),
      canConsume: vi.fn(),
      reset: vi.fn(),
      destroy: vi.fn(),
    };
    const manager = new RotationManager({
      providerInstance: createMockProvider(),
      rateLimiter: customLimiter as any,
    });

    expect(manager.limiter).toBe(customLimiter);
  });
});
