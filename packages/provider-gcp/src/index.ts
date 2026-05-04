import type { ProviderConfig, SecretProvider } from '@reaatech/secret-rotation-types';
import { registerProvider } from '@reaatech/secret-rotation-types';
import { GCPProvider } from './provider.js';

registerProvider('gcp', GCPProvider as unknown as new (config: ProviderConfig) => SecretProvider);

export { GCPProvider };
