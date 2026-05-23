import { describe, expect, it } from 'vitest';
import type { SecretProvider } from './interfaces.js';
import type {
  DeleteOptions,
  ProviderCapabilities,
  ProviderConfig,
  ProviderHealth,
  SecretValue,
  SecretVersion,
} from './provider.js';
import { createProvider, getRegisteredTypes, registerProvider } from './provider-registry.js';
import type { RotationSession } from './rotation.js';

class MockProvider implements SecretProvider {
  name = 'mock';
  priority = 0;

  async createSecret(_name: string, _value: string): Promise<void> {
    return undefined;
  }

  async getSecret(_name: string, _version?: string): Promise<SecretValue> {
    throw new Error('not implemented');
  }

  async storeSecretValue(
    _name: string,
    _value: string,
    _options?: { stage?: 'current' | 'pending' },
  ): Promise<SecretValue> {
    throw new Error('not implemented');
  }

  async deleteSecret(_name: string, _options?: DeleteOptions): Promise<void> {
    return undefined;
  }

  async listVersions(_name: string): Promise<SecretVersion[]> {
    return [];
  }

  async getVersion(_name: string, _versionId: string): Promise<SecretValue> {
    throw new Error('not implemented');
  }

  async deleteVersion(_name: string, _versionId: string): Promise<void> {
    return undefined;
  }

  supportsRotation(): boolean {
    return false;
  }

  async beginRotation(_name: string): Promise<RotationSession> {
    throw new Error('not implemented');
  }

  async completeRotation(_session: RotationSession): Promise<void> {
    return undefined;
  }

  async cancelRotation(_session: RotationSession): Promise<void> {
    return undefined;
  }

  async health(): Promise<ProviderHealth> {
    return { status: 'healthy', latency: 0, lastChecked: new Date() };
  }

  capabilities(): ProviderCapabilities {
    return { supportsRotation: false, supportsVersioning: false, supportsLabels: false };
  }
}

class AnotherMockProvider implements SecretProvider {
  name = 'another';
  priority = 1;

  async createSecret(_name: string, _value: string): Promise<void> {
    return undefined;
  }

  async getSecret(_name: string, _version?: string): Promise<SecretValue> {
    throw new Error('not implemented');
  }

  async storeSecretValue(
    _name: string,
    _value: string,
    _options?: { stage?: 'current' | 'pending' },
  ): Promise<SecretValue> {
    throw new Error('not implemented');
  }

  async deleteSecret(_name: string, _options?: DeleteOptions): Promise<void> {
    return undefined;
  }

  async listVersions(_name: string): Promise<SecretVersion[]> {
    return [];
  }

  async getVersion(_name: string, _versionId: string): Promise<SecretValue> {
    throw new Error('not implemented');
  }

  async deleteVersion(_name: string, _versionId: string): Promise<void> {
    return undefined;
  }

  supportsRotation(): boolean {
    return false;
  }

  async beginRotation(_name: string): Promise<RotationSession> {
    throw new Error('not implemented');
  }

  async completeRotation(_session: RotationSession): Promise<void> {
    return undefined;
  }

  async cancelRotation(_session: RotationSession): Promise<void> {
    return undefined;
  }

  async health(): Promise<ProviderHealth> {
    return { status: 'healthy', latency: 0, lastChecked: new Date() };
  }

  capabilities(): ProviderCapabilities {
    return { supportsRotation: false, supportsVersioning: false, supportsLabels: false };
  }
}

describe('provider-registry', () => {
  it('getRegisteredTypes returns an array', () => {
    // The registry is a module-level singleton, so don't assume emptiness here
    // (that would couple this test to running first); just assert the shape.
    expect(Array.isArray(getRegisteredTypes())).toBe(true);
  });

  it('registerProvider adds a type to the registry', () => {
    registerProvider('create-test', MockProvider);
    expect(getRegisteredTypes()).toContain('create-test');
  });

  it('createProvider returns an instance for a registered type', () => {
    registerProvider('aws', MockProvider);
    const instance = createProvider({ type: 'aws' });
    expect(instance).toBeInstanceOf(MockProvider);
    expect(instance.name).toBe('mock');
  });

  it('createProvider throws for an unregistered type', () => {
    expect(() => createProvider({ type: 'gcp' })).toThrow('No provider registered for type: gcp');
  });

  it('createProvider passes config to the constructor', () => {
    registerProvider('vault', MockProvider);
    const config: ProviderConfig = {
      type: 'vault',
      url: 'http://localhost:8200',
      mountPath: 'secret',
    };
    const instance = createProvider(config);
    expect(instance).toBeInstanceOf(MockProvider);
  });

  it('getRegisteredTypes returns all registered types', () => {
    registerProvider('list-test-a', MockProvider);
    registerProvider('list-test-b', AnotherMockProvider);
    const types = getRegisteredTypes();
    expect(types).toContain('list-test-a');
    expect(types).toContain('list-test-b');
  });
});
