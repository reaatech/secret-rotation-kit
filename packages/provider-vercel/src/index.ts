import type { ProviderConfig, SecretProvider } from '@reaatech/secret-rotation-types';
import { registerProvider } from '@reaatech/secret-rotation-types';
import { VercelProvider } from './provider.js';

registerProvider(
  'vercel',
  VercelProvider as unknown as new (
    config: ProviderConfig,
  ) => SecretProvider,
);

export { VercelProvider } from './provider.js';
