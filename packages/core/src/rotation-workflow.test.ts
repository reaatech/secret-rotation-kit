import type {
  EventEmitter,
  KeyGenerator,
  KeyStore,
  Logger,
  PropagationVerifier,
  SecretProvider,
} from '@reaatech/secret-rotation-types';
import type { SecretKey } from '@reaatech/secret-rotation-types';
import type { VerificationResult } from '@reaatech/secret-rotation-types';
import { describe, expect, it, vi } from 'vitest';
import { ProviderError, RotationError } from './errors.js';
import { RotationWorkflow } from './rotation-workflow.js';

function createMockKeyGenerator(): KeyGenerator {
  let counter = 0;
  return {
    generate: vi.fn(async (options) => ({
      keyId: `key-${++counter}`,
      secretName: options.secretName,
      encryptedMaterial: 'encrypted-value',
      format: options.format ?? 'base64',
      validFrom: new Date(),
      status: 'pending' as const,
      createdAt: new Date(),
      metadata: options.metadata,
    })),
    validate: vi.fn(() => true),
    encrypt: vi.fn(async (key) => key),
    decrypt: vi.fn(async (key) => key),
  };
}

function createMockProvider(): SecretProvider {
  return {
    name: 'mock-provider',
    priority: 1,
    createSecret: vi.fn(),
    getSecret: vi.fn(async () => ({
      value: 'secret',
      versionId: 'v1',
      createdAt: new Date(),
    })),
    storeSecretValue: vi.fn(async (_name, value, _options) => ({
      value,
      versionId: 'v2',
      createdAt: new Date(),
    })),
    deleteSecret: vi.fn(),
    listVersions: vi.fn(),
    getVersion: vi.fn(),
    deleteVersion: vi.fn(),
    supportsRotation: vi.fn(() => true),
    beginRotation: vi.fn(async (name) => ({
      sessionId: 'session-1',
      secretName: name,
      provider: 'mock-provider',
      state: { versionId: 'v2' },
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

function createMockKeyStore(): KeyStore {
  const store = new Map<string, Map<string, SecretKey>>();
  return {
    save: vi.fn(async (key) => {
      if (!store.has(key.secretName)) store.set(key.secretName, new Map());
      store.get(key.secretName)?.set(key.keyId, key);
    }),
    get: vi.fn(async (secretName, keyId) => store.get(secretName)?.get(keyId) ?? null),
    getActive: vi.fn(async (secretName) => {
      const keys = Array.from(store.get(secretName)?.values() ?? []);
      return keys.find((k) => k.status === 'active') ?? null;
    }),
    getValid: vi.fn(async (secretName) => {
      return Array.from(store.get(secretName)?.values() ?? []);
    }),
    update: vi.fn(async (key) => {
      store.get(key.secretName)?.set(key.keyId, key);
    }),
    delete: vi.fn(async (secretName, keyId) => {
      store.get(secretName)?.delete(keyId);
    }),
    list: vi.fn(async (secretName) => {
      if (secretName) return Array.from(store.get(secretName)?.values() ?? []);
      return Array.from(store.values()).flatMap((m) => Array.from(m.values()));
    }),
  };
}

function createMockVerifier(result: VerificationResult): PropagationVerifier {
  return {
    verify: vi.fn(async () => result),
    getVerificationStatus: vi.fn(),
    cancelVerification: vi.fn(),
  };
}

function createMockEventEmitter(): EventEmitter {
  const events: Array<{ type: string; data: unknown }> = [];
  return {
    emit: vi.fn(async (event) => {
      events.push({ type: event.type, data: event });
    }),
    on: vi.fn(),
    off: vi.fn(),
    replay: vi.fn(async function* () {
      for (const e of events) yield e.data as never;
    }),
  };
}

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('RotationWorkflow', () => {
  it('executes a full successful rotation', async () => {
    const keyGenerator = createMockKeyGenerator();
    const provider = createMockProvider();
    const keyStore = createMockKeyStore();
    const verifier = createMockVerifier({
      success: true,
      consumerCount: 1,
      verifiedCount: 1,
      coverage: 1,
      duration: 100,
      failures: [],
      canRetry: false,
    });
    const eventEmitter = createMockEventEmitter();
    const logger = createMockLogger();

    const workflow = new RotationWorkflow(
      keyGenerator,
      provider,
      keyStore,
      verifier,
      eventEmitter,
      logger,
    );

    const result = await workflow.execute({ secretName: 'my-secret' });

    expect(result.success).toBe(true);
    expect(result.newKeyId).toBe('key-1');
    expect(result.duration).toBeGreaterThanOrEqual(0);

    // Verify each step was called
    expect(keyGenerator.generate).toHaveBeenCalled();
    expect(provider.beginRotation).toHaveBeenCalledWith('my-secret');
    expect(provider.storeSecretValue).toHaveBeenCalledWith('my-secret', 'encrypted-value', {
      stage: 'pending',
    });
    expect(verifier.verify).toHaveBeenCalled();
    expect(provider.completeRotation).toHaveBeenCalled();
  });

  it('emits lifecycle events', async () => {
    const keyGenerator = createMockKeyGenerator();
    const provider = createMockProvider();
    const keyStore = createMockKeyStore();
    const verifier = createMockVerifier({
      success: true,
      consumerCount: 1,
      verifiedCount: 1,
      coverage: 1,
      duration: 100,
      failures: [],
      canRetry: false,
    });
    const eventEmitter = createMockEventEmitter();

    const workflow = new RotationWorkflow(
      keyGenerator,
      provider,
      keyStore,
      verifier,
      eventEmitter,
      undefined,
    );

    await workflow.execute({ secretName: 'my-secret' });

    const emittedTypes = vi.mocked(eventEmitter.emit).mock.calls.map((call) => call[0].type);
    expect(emittedTypes).toContain('key_generated');
    expect(emittedTypes).toContain('key_propagated');
    expect(emittedTypes).toContain('key_verified');
    expect(emittedTypes).toContain('key_activated');
  });

  it('stores the generated key in the key store', async () => {
    const keyGenerator = createMockKeyGenerator();
    const provider = createMockProvider();
    const keyStore = createMockKeyStore();
    const verifier = createMockVerifier({
      success: true,
      consumerCount: 1,
      verifiedCount: 1,
      coverage: 1,
      duration: 100,
      failures: [],
      canRetry: false,
    });

    const workflow = new RotationWorkflow(
      keyGenerator,
      provider,
      keyStore,
      verifier,
      undefined,
      undefined,
    );

    await workflow.execute({ secretName: 'my-secret' });

    expect(keyStore.save).toHaveBeenCalled();
    const savedKey = vi.mocked(keyStore.save).mock.calls[0][0] as SecretKey;
    expect(savedKey.secretName).toBe('my-secret');
    expect(savedKey.status).toBe('pending');
  });

  it('throws when provider does not support rotation', async () => {
    const keyGenerator = createMockKeyGenerator();
    const provider = createMockProvider();
    provider.supportsRotation = vi.fn(() => false);

    const workflow = new RotationWorkflow(
      keyGenerator,
      provider,
      createMockKeyStore(),
      createMockVerifier({
        success: true,
        consumerCount: 0,
        verifiedCount: 0,
        coverage: 0,
        duration: 0,
        failures: [],
        canRetry: false,
      }),
      undefined,
      undefined,
    );

    await expect(workflow.execute({ secretName: 'my-secret' })).rejects.toThrow(ProviderError);
  });

  it('throws when verification fails', async () => {
    const keyGenerator = createMockKeyGenerator();
    const provider = createMockProvider();
    const verifier = createMockVerifier({
      success: false,
      consumerCount: 1,
      verifiedCount: 0,
      coverage: 0,
      duration: 100,
      failures: [{ consumerId: 'c1', reason: 'timeout', canRetry: true }],
      canRetry: true,
    });

    const workflow = new RotationWorkflow(
      keyGenerator,
      provider,
      createMockKeyStore(),
      verifier,
      undefined,
      undefined,
    );

    await expect(workflow.execute({ secretName: 'my-secret' })).rejects.toThrow(RotationError);
  });

  it('cancels provider rotation and marks key failed on error', async () => {
    const keyGenerator = createMockKeyGenerator();
    const provider = createMockProvider();
    const keyStore = createMockKeyStore();
    const verifier = createMockVerifier({
      success: false,
      consumerCount: 1,
      verifiedCount: 0,
      coverage: 0,
      duration: 100,
      failures: [],
      canRetry: true,
    });
    const eventEmitter = createMockEventEmitter();

    const workflow = new RotationWorkflow(
      keyGenerator,
      provider,
      keyStore,
      verifier,
      eventEmitter,
      undefined,
    );

    try {
      await workflow.execute({ secretName: 'my-secret' });
    } catch {
      /* expected */
    }

    expect(provider.cancelRotation).toHaveBeenCalled();

    // Key should have been marked as failed
    const updatedKey = vi
      .mocked(keyStore.update)
      .mock.calls.find((call) => (call[0] as SecretKey).status === 'failed');
    expect(updatedKey).toBeDefined();
  });

  it('emits rotation_failed event on error', async () => {
    const keyGenerator = createMockKeyGenerator();
    const provider = createMockProvider();
    const verifier = createMockVerifier({
      success: false,
      consumerCount: 1,
      verifiedCount: 0,
      coverage: 0,
      duration: 100,
      failures: [],
      canRetry: true,
    });
    const eventEmitter = createMockEventEmitter();

    const workflow = new RotationWorkflow(
      keyGenerator,
      provider,
      createMockKeyStore(),
      verifier,
      eventEmitter,
      undefined,
    );

    try {
      await workflow.execute({ secretName: 'my-secret' });
    } catch {
      /* expected */
    }

    const emittedTypes = vi.mocked(eventEmitter.emit).mock.calls.map((call) => call[0].type);
    expect(emittedTypes).toContain('rotation_failed');
  });

  it('passes request options to key generator and verifier', async () => {
    const keyGenerator = createMockKeyGenerator();
    const provider = createMockProvider();
    const verifier = createMockVerifier({
      success: true,
      consumerCount: 1,
      verifiedCount: 1,
      coverage: 1,
      duration: 100,
      failures: [],
      canRetry: false,
    });

    const workflow = new RotationWorkflow(
      keyGenerator,
      provider,
      createMockKeyStore(),
      verifier,
      undefined,
      undefined,
    );

    await workflow.execute({
      secretName: 'my-secret',
      keyFormat: 'hex',
      verificationTimeout: 5000,
      minConsumerCoverage: 0.95,
      metadata: { source: 'test' },
    });

    expect(keyGenerator.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        secretName: 'my-secret',
        format: 'hex',
        metadata: expect.objectContaining({ source: 'test' }),
      }),
    );

    expect(verifier.verify).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        timeout: 5000,
        minConsumerCoverage: 0.95,
      }),
    );
  });

  it('handles cancelRotation failure during cleanup', async () => {
    const keyGenerator = createMockKeyGenerator();
    const provider = createMockProvider();
    provider.cancelRotation = vi.fn(async () => {
      throw new Error('cancel failed');
    });
    const verifier = createMockVerifier({
      success: false,
      consumerCount: 1,
      verifiedCount: 0,
      coverage: 0,
      duration: 100,
      failures: [],
      canRetry: true,
    });
    const logger = createMockLogger();

    const workflow = new RotationWorkflow(
      keyGenerator,
      provider,
      createMockKeyStore(),
      verifier,
      undefined,
      logger,
    );

    await expect(workflow.execute({ secretName: 'my-secret' })).rejects.toThrow();
    expect(provider.cancelRotation).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to cancel provider rotation session',
      expect.any(Object),
    );
  });

  it('handles markFailed failure during cleanup gracefully', async () => {
    const keyGenerator = createMockKeyGenerator();
    const provider = createMockProvider();
    const keyStore = createMockKeyStore();
    keyStore.update = vi.fn(async () => {
      throw new Error('update failed');
    });
    const verifier = createMockVerifier({
      success: false,
      consumerCount: 1,
      verifiedCount: 0,
      coverage: 0,
      duration: 100,
      failures: [],
      canRetry: true,
    });

    const workflow = new RotationWorkflow(
      keyGenerator,
      provider,
      keyStore,
      verifier,
      undefined,
      undefined,
    );

    // Should not throw during cleanup even if markFailed fails
    await expect(workflow.execute({ secretName: 'my-secret' })).rejects.toThrow();
  });

  it('swallows event emitter errors', async () => {
    const keyGenerator = createMockKeyGenerator();
    const provider = createMockProvider();
    const eventEmitter = createMockEventEmitter();
    eventEmitter.emit = vi.fn(async () => {
      throw new Error('emitter boom');
    });

    const workflow = new RotationWorkflow(
      keyGenerator,
      provider,
      createMockKeyStore(),
      createMockVerifier({
        success: true,
        consumerCount: 1,
        verifiedCount: 1,
        coverage: 1,
        duration: 100,
        failures: [],
        canRetry: false,
      }),
      eventEmitter,
      undefined,
    );

    // Should succeed even though emitter throws
    await expect(workflow.execute({ secretName: 'my-secret' })).resolves.toBeDefined();
  });
});
