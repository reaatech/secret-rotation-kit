import { InMemoryEventEmitter, RotationManager } from '@reaatech/secret-rotation-core';
import { LoggerService, MetricsService } from '@reaatech/secret-rotation-observability';
import { createProvider, type ProviderConfig } from '@reaatech/secret-rotation-types';
import { SidecarServer } from './server.js';

/**
 * Wiring for the standalone rotation sidecar. The executable entry point lives
 * in `bin.ts`, which calls {@link main}; this module is import-safe (no
 * top-level side effects) so it can be unit tested.
 *
 * Configuration is read entirely from environment variables so the binary can
 * be dropped into a container or process manager without code. Run it with:
 *
 * ```sh
 * SRK_PROVIDER=aws SRK_AWS_REGION=us-east-1 npx secret-rotation-sidecar
 * ```
 */

const PROVIDER_PACKAGES: Record<string, string> = {
  aws: '@reaatech/secret-rotation-provider-aws',
  gcp: '@reaatech/secret-rotation-provider-gcp',
  vault: '@reaatech/secret-rotation-provider-vault',
  vercel: '@reaatech/secret-rotation-provider-vercel',
};

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function buildProviderConfig(type: string): ProviderConfig {
  switch (type) {
    case 'aws':
      return {
        type: 'aws',
        region: requireEnv('SRK_AWS_REGION'),
        ...(process.env.SRK_AWS_ENDPOINT && { endpoint: process.env.SRK_AWS_ENDPOINT }),
      };
    case 'gcp':
      return {
        type: 'gcp',
        projectId: requireEnv('SRK_GCP_PROJECT_ID'),
        ...(process.env.SRK_GCP_ENDPOINT && { endpoint: process.env.SRK_GCP_ENDPOINT }),
      };
    case 'vault':
      return {
        type: 'vault',
        url: requireEnv('SRK_VAULT_URL'),
        mountPath: process.env.SRK_VAULT_MOUNT ?? 'secret',
        ...(process.env.SRK_VAULT_TOKEN && { token: process.env.SRK_VAULT_TOKEN }),
      };
    case 'vercel':
      return {
        type: 'vercel',
        token: requireEnv('SRK_VERCEL_TOKEN'),
        projectId: requireEnv('SRK_VERCEL_PROJECT_ID'),
        ...(process.env.SRK_VERCEL_TEAM_ID && { teamId: process.env.SRK_VERCEL_TEAM_ID }),
        ...(process.env.SRK_VERCEL_TARGET && {
          target: process.env.SRK_VERCEL_TARGET.split(',').map((t) => t.trim()),
        }),
      };
    default:
      throw new Error(
        `Unknown SRK_PROVIDER "${type}". Expected one of: ${Object.keys(PROVIDER_PACKAGES).join(', ')}`,
      );
  }
}

/**
 * Load the provider package so it registers itself with the provider registry.
 *
 * Uses a dynamic `import()` (rather than `require`) so the provider resolves
 * through the same ES module graph as this CLI — otherwise it would register
 * into a separate CJS copy of the registry and `createProvider` would not see it.
 */
export async function loadProviderPackage(type: string): Promise<void> {
  const pkg = PROVIDER_PACKAGES[type];
  if (!pkg) {
    throw new Error(
      `Unknown SRK_PROVIDER "${type}". Expected one of: ${Object.keys(PROVIDER_PACKAGES).join(', ')}`,
    );
  }
  try {
    await import(pkg);
  } catch (cause) {
    throw new Error(
      `Provider package "${pkg}" is not installed. Install it with:\n  npm install ${pkg}`,
      { cause },
    );
  }
}

export async function main(): Promise<void> {
  const providerType = requireEnv('SRK_PROVIDER').toLowerCase();

  const logger = new LoggerService({
    level: (process.env.SRK_LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') ?? 'info',
    structured: process.env.SRK_LOG_STRUCTURED !== 'false',
  });

  await loadProviderPackage(providerType);
  const provider = createProvider(buildProviderConfig(providerType));

  const eventEmitter = new InMemoryEventEmitter();
  const metrics = new MetricsService(logger);

  const rotationIntervalMs = process.env.SRK_ROTATION_INTERVAL_MS
    ? Number.parseInt(process.env.SRK_ROTATION_INTERVAL_MS, 10)
    : undefined;

  const manager = new RotationManager({
    providerInstance: provider,
    logger,
    eventEmitter,
    ...(rotationIntervalMs ? { rotationIntervalMs } : {}),
  });

  const server = new SidecarServer({
    port: Number.parseInt(process.env.PORT ?? process.env.SRK_PORT ?? '8080', 10),
    host: process.env.SRK_HOST ?? '0.0.0.0',
    manager,
    eventEmitter,
    metrics,
    logger,
    ...(process.env.SRK_CORS_ORIGIN && { corsOrigin: process.env.SRK_CORS_ORIGIN }),
    ...(process.env.SRK_AUTH_TOKEN && { authToken: process.env.SRK_AUTH_TOKEN }),
  });

  await server.start();

  // Optionally kick off scheduled rotation for a fixed set of secrets.
  const secrets = (process.env.SRK_SECRETS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (secrets.length > 0 && rotationIntervalMs) {
    await manager.start(secrets);
  } else if (secrets.length > 0) {
    logger.warn('SRK_SECRETS set but SRK_ROTATION_INTERVAL_MS missing; scheduling disabled');
  }

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutting down sidecar', { signal });
    try {
      await manager.stop();
      await server.stop();
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}
