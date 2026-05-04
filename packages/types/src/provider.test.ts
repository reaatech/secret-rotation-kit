import { describe, expect, it } from 'vitest';
import type {
  AWSProviderConfig,
  GCPProviderConfig,
  ProviderCapabilities,
  ProviderHealth,
  SecretValue,
  SecretVersion,
  VaultProviderConfig,
} from './provider.js';

describe('SecretValue', () => {
  it('can be constructed with required fields', () => {
    const value: SecretValue = {
      value: 'super-secret',
      versionId: 'v1',
      createdAt: new Date(),
    };

    expect(value.versionId).toBe('v1');
  });
});

describe('SecretVersion', () => {
  it('tracks version metadata', () => {
    const version: SecretVersion = {
      versionId: 'v1',
      createdAt: new Date(),
      stages: ['AWSCURRENT'],
    };

    expect(version.stages).toContain('AWSCURRENT');
  });
});

describe('ProviderHealth', () => {
  it('can represent all health states', () => {
    const states: ProviderHealth['status'][] = ['healthy', 'degraded', 'unhealthy'];
    expect(states).toHaveLength(3);
  });
});

describe('ProviderCapabilities', () => {
  it('advertises supported features', () => {
    const caps: ProviderCapabilities = {
      supportsRotation: true,
      supportsVersioning: true,
      supportsLabels: false,
      maxVersions: 100,
    };

    expect(caps.supportsRotation).toBe(true);
    expect(caps.maxVersions).toBe(100);
  });
});

describe('ProviderConfig variants', () => {
  it('accepts AWS config', () => {
    const config: AWSProviderConfig = {
      type: 'aws',
      region: 'us-east-1',
    };

    expect(config.type).toBe('aws');
  });

  it('accepts GCP config', () => {
    const config: GCPProviderConfig = {
      type: 'gcp',
      projectId: 'my-project',
    };

    expect(config.type).toBe('gcp');
  });

  it('accepts Vault config', () => {
    const config: VaultProviderConfig = {
      type: 'vault',
      url: 'https://vault.example.com',
      mountPath: 'secret',
      authMethod: 'token',
    };

    expect(config.type).toBe('vault');
  });
});
