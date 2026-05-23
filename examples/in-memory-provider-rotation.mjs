/**
 * End-to-end rotation against a custom in-memory provider — no cloud account
 * required. See ./in-memory-provider.mjs for a reference implementation of the
 * `SecretProvider` interface.
 *
 *   pnpm --filter @reaatech/secret-rotation-examples start:in-memory
 */
import { RotationManager } from '@reaatech/secret-rotation-core';
import { LoggerService } from '@reaatech/secret-rotation-observability';
import { InMemoryProvider } from './in-memory-provider.mjs';

const logger = new LoggerService({ level: 'info', structured: false });
const provider = new InMemoryProvider();

const manager = new RotationManager({ providerInstance: provider, logger });

manager.events.on('key_activated', (event) => {
  logger.info(`✅ new key active for "${event.secretName}"`);
});
manager.events.on('rotation_failed', (event) => {
  logger.error(`❌ rotation failed for "${event.secretName}"`);
});

await provider.createSecret('database-password', 'initial-value');
logger.info('seeded database-password with an initial value');

const before = await provider.getSecret('database-password');
logger.info(`current version before rotation: ${before.versionId}`);

const result = await manager.rotate('database-password');
logger.info(`rotation completed in ${result.duration}ms`);

const after = await provider.getSecret('database-password');
logger.info(`current version after rotation:  ${after.versionId}`);
logger.info(`value changed: ${before.value !== after.value}`);
