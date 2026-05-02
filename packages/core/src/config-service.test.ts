import { describe, expect, it } from 'vitest';
import { configDefaults, createConfig } from './config-service.js';

describe('createConfig', () => {
  it('builds full config from minimal provider config', () => {
    const config = createConfig({ type: 'aws', region: 'us-east-1' });

    expect(config.provider.type).toBe('aws');
    expect(config.provider.region).toBe('us-east-1');
    expect(config.keyGeneration.algorithm).toBe('aes-256-gcm');
    expect(config.keyGeneration.keyLength).toBe(256);
    expect(config.scheduling.enabled).toBe(false);
    expect(config.verification.timeout).toBe(30000);
    expect(config.verification.minConsumerCoverage).toBe(0.95);
  });

  it('accepts overrides', () => {
    const config = createConfig(
      { type: 'gcp', projectId: 'my-project' },
      {
        verification: { timeout: 10000 },
        keyWindows: { overlapPeriodMs: 60000 },
        observability: { logging: { level: 'debug' } },
      },
    );

    expect(config.verification.timeout).toBe(10000);
    expect(config.keyWindows.overlapPeriodMs).toBe(60000);
    expect(config.observability.logging.level).toBe('debug');
    expect(config.verification.strategy).toBe('active');
  });

  it('supports deep partial override', () => {
    const config = createConfig(
      { type: 'vault', url: 'http://localhost:8200', mountPath: 'secret' },
      {
        scheduling: { enabled: true },
        sidecar: { port: 9090, enableGRPC: true },
        observability: { tracing: { enabled: true } },
      },
    );

    expect(config.scheduling.enabled).toBe(true);
    expect(config.scheduling.interval).toBe(86400000);
    expect(config.sidecar.port).toBe(9090);
    expect(config.sidecar.enableGRPC).toBe(true);
    expect(config.observability.tracing.enabled).toBe(true);
  });

  it('Vault provider config works', () => {
    const config = createConfig({
      type: 'vault',
      url: 'https://vault.internal:8200',
      mountPath: 'kv',
      authMethod: 'approle',
    });

    expect(config.provider.type).toBe('vault');
    expect(config.events.enabled).toBe(true);
  });

  it('rejects __proto__ keys in overrides', () => {
    const overrides = {
      __proto__: { polluted: true },
      verification: { timeout: 5000 },
    } as Record<string, unknown>;

    const config = createConfig(
      { type: 'aws', region: 'us-east-1' },
      overrides as Parameters<typeof createConfig>[1],
    );

    expect(config.verification.timeout).toBe(5000);
    expect((config as unknown as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects constructor and prototype keys in overrides', () => {
    const config = createConfig({ type: 'aws', region: 'us-east-1' }, {
      constructor: 'bad',
      prototype: 'bad',
      verification: { timeout: 10000 },
    } as Parameters<typeof createConfig>[1]);

    expect(config.verification.timeout).toBe(10000);
  });
});

describe('configDefaults', () => {
  it('returns a copy of defaults', () => {
    const d1 = configDefaults();
    const d2 = configDefaults();
    expect(d1).toEqual(d2);
    expect(d1).not.toBe(d2);
  });

  it('defaults include all sections', () => {
    const defaults = configDefaults();
    expect(defaults.keyGeneration).toBeDefined();
    expect(defaults.scheduling).toBeDefined();
    expect(defaults.verification).toBeDefined();
    expect(defaults.keyWindows).toBeDefined();
    expect(defaults.events).toBeDefined();
    expect(defaults.sidecar).toBeDefined();
    expect(defaults.observability).toBeDefined();
  });
});
