import { describe, expect, it } from 'vitest';
import type { RotationConfig, VerificationConfig } from './config.js';

describe('RotationConfig', () => {
  it('accepts a complete configuration object', () => {
    const config: RotationConfig = {
      provider: {
        type: 'aws',
        region: 'us-east-1',
      },
      keyGeneration: {
        algorithm: 'aes-256-gcm',
        keyLength: 256,
        format: 'base64',
      },
      scheduling: {
        enabled: true,
        cron: '0 2 * * *',
        timezone: 'UTC',
      },
      verification: {
        strategy: 'hybrid',
        timeout: 30000,
        minConsumerCoverage: 0.95,
        perConsumerTimeout: 5000,
        retryPolicy: {
          maxRetries: 3,
          backoffMultiplier: 2,
          initialDelayMs: 1000,
          maxDelayMs: 30000,
        },
      },
      keyWindows: {
        overlapPeriodMs: 300000,
        gracePeriodMs: 86400000,
      },
      events: {
        enabled: true,
        transports: [],
        persistence: {
          enabled: false,
        },
      },
      sidecar: {
        enabled: false,
        port: 8080,
        enableGRPC: false,
      },
      observability: {
        logging: {
          level: 'info',
          structured: true,
        },
        metrics: {
          enabled: true,
          format: 'prometheus',
        },
        tracing: {
          enabled: false,
        },
      },
    };

    expect(config.provider.type).toBe('aws');
    expect(config.verification.strategy).toBe('hybrid');
  });
});

describe('VerificationConfig', () => {
  it('accepts all strategy variants', () => {
    const strategies: VerificationConfig['strategy'][] = ['active', 'passive', 'hybrid'];

    for (const strategy of strategies) {
      const config: VerificationConfig = {
        strategy,
        timeout: 30000,
        minConsumerCoverage: 0.95,
        perConsumerTimeout: 5000,
        retryPolicy: {
          maxRetries: 3,
          backoffMultiplier: 2,
          initialDelayMs: 1000,
          maxDelayMs: 30000,
        },
      };

      expect(config.strategy).toBe(strategy);
    }
  });
});
