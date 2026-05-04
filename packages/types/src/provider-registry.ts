import type { SecretProvider } from './interfaces.js';
import type { ProviderConfig } from './provider.js';

type ProviderConstructor = new (config: ProviderConfig) => SecretProvider;

const registry = new Map<string, ProviderConstructor>();

export function registerProvider(type: string, ctor: ProviderConstructor): void {
  registry.set(type, ctor);
}

export function createProvider(config: ProviderConfig): SecretProvider {
  const Ctor = registry.get(config.type);
  if (!Ctor) {
    throw new Error(
      `No provider registered for type: ${config.type}. Import the provider package first.`,
    );
  }
  return new Ctor(config);
}

export function getRegisteredTypes(): string[] {
  return Array.from(registry.keys());
}
