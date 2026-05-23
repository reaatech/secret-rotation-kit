/**
 * Boot the HTTP sidecar programmatically and exercise its endpoints. Uses a
 * tiny in-memory provider so it runs with no cloud account.
 *
 *   pnpm --filter @reaatech/secret-rotation-examples start:sidecar
 *
 * Then, in another shell:
 *   curl localhost:8080/health
 *   curl -N localhost:8080/events
 *   curl -X POST localhost:8080/rotate -H 'content-type: application/json' \
 *     -d '{"secretName":"database-password"}'
 */
import { InMemoryEventEmitter, RotationManager } from '@reaatech/secret-rotation-core';
import { LoggerService, MetricsService } from '@reaatech/secret-rotation-observability';
import { SidecarServer } from '@reaatech/secret-rotation-sidecar';
import { InMemoryProvider } from './in-memory-provider.mjs';

const provider = new InMemoryProvider();
const logger = new LoggerService({ level: 'info', structured: false });
const eventEmitter = new InMemoryEventEmitter();
const metrics = new MetricsService(logger);
const manager = new RotationManager({ providerInstance: provider, eventEmitter, logger });

await provider.createSecret('database-password', 'initial-value');

const server = new SidecarServer({
  manager,
  eventEmitter,
  metrics,
  logger,
  port: Number(process.env.PORT ?? 8080),
  host: '127.0.0.1',
});

await server.start();
logger.info(`sidecar listening at ${server.address}`);
logger.info(`try: curl ${server.address}/health`);

process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});
