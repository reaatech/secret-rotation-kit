import type { ProviderConfig, SecretProvider } from '@reaatech/secret-rotation-types';
import { registerProvider } from '@reaatech/secret-rotation-types';
import { VaultProvider } from './provider.js';

registerProvider(
  'vault',
  VaultProvider as unknown as new (
    config: ProviderConfig,
  ) => SecretProvider,
);

export { VaultProvider };
