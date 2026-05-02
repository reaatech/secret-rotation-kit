import type { ProviderConfig, SecretProvider } from '@reaatech/secret-rotation-types';
import { registerProvider } from '@reaatech/secret-rotation-types';
import { AWSProvider } from './provider.js';

registerProvider('aws', AWSProvider as unknown as new (config: ProviderConfig) => SecretProvider);

export { AWSProvider };
