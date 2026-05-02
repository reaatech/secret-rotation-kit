import { describe, expect, it, vi } from 'vitest';
import type {
  EventEmitter,
  EventHandler,
  KeyGenerator,
  KeyStore,
  Logger,
  PropagationVerifier,
  SecretProvider,
} from './interfaces.js';

describe('SecretProvider interface compatibility', () => {
  it('accepts a minimal mock provider', async () => {
    const provider: SecretProvider = {
      name: 'mock',
      priority: 1,
      createSecret: vi.fn(),
      getSecret: vi.fn(),
      storeSecretValue: vi.fn(),
      deleteSecret: vi.fn(),
      listVersions: vi.fn(),
      getVersion: vi.fn(),
      deleteVersion: vi.fn(),
      supportsRotation: vi.fn(() => true),
      beginRotation: vi.fn(),
      completeRotation: vi.fn(),
      cancelRotation: vi.fn(),
      health: vi.fn(),
      capabilities: vi.fn(),
    };

    expect(provider.supportsRotation()).toBe(true);
    expect(provider.name).toBe('mock');
  });
});

describe('KeyStore interface compatibility', () => {
  it('accepts a minimal mock store', async () => {
    const store: KeyStore = {
      save: vi.fn(),
      get: vi.fn(),
      getActive: vi.fn(),
      getValid: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    };

    await store.save({
      keyId: 'k1',
      secretName: 's1',
      encryptedMaterial: 'm1',
      format: 'base64',
      validFrom: new Date(),
      status: 'active',
      createdAt: new Date(),
    });

    expect(store.save).toHaveBeenCalledTimes(1);
  });
});

describe('KeyGenerator interface compatibility', () => {
  it('accepts a minimal mock generator', async () => {
    const generator: KeyGenerator = {
      generate: vi.fn(),
      validate: vi.fn(() => true),
      encrypt: vi.fn(),
      decrypt: vi.fn(),
    };

    expect(generator.validate({} as Parameters<KeyGenerator['validate']>[0])).toBe(true);
  });
});

describe('PropagationVerifier interface compatibility', () => {
  it('accepts a minimal mock verifier', async () => {
    const verifier: PropagationVerifier = {
      verify: vi.fn(),
      getVerificationStatus: vi.fn(),
      cancelVerification: vi.fn(),
    };

    await verifier.cancelVerification({
      sessionId: 's1',
      secretName: 'test',
      provider: 'mock',
      state: {},
      startedAt: new Date(),
    });

    expect(verifier.cancelVerification).toHaveBeenCalledTimes(1);
  });
});

describe('EventEmitter interface compatibility', () => {
  it('accepts a minimal mock emitter', async () => {
    const emitter: EventEmitter = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      replay: vi.fn(),
    };

    const handler: EventHandler = vi.fn();
    emitter.on('key_generated', handler);

    expect(emitter.on).toHaveBeenCalledWith('key_generated', handler);
  });
});

describe('Logger interface compatibility', () => {
  it('accepts a minimal mock logger', () => {
    const logger: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    logger.info('test message', { key: 'value' });

    expect(logger.info).toHaveBeenCalledWith('test message', { key: 'value' });
  });
});
