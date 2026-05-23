/**
 * Rotate a secret in AWS Secrets Manager.
 *
 * Requires AWS credentials in the environment (e.g. AWS_PROFILE or
 * AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY) and the optional peer dependency:
 *
 *   npm install @aws-sdk/client-secrets-manager
 *
 * Run against LocalStack by setting SRK_AWS_ENDPOINT=http://localhost:4566.
 *
 *   AWS_REGION=us-east-1 SECRET_NAME=demo/api-key \
 *     pnpm --filter @reaatech/secret-rotation-examples start:aws
 */
import { RotationManager } from '@reaatech/secret-rotation-core';
import { LoggerService } from '@reaatech/secret-rotation-observability';
import { AWSProvider } from '@reaatech/secret-rotation-provider-aws';

const region = process.env.AWS_REGION ?? 'us-east-1';
const secretName = process.env.SECRET_NAME ?? 'demo/api-key';

const logger = new LoggerService({ level: 'info', structured: false });

const provider = new AWSProvider({
  type: 'aws',
  region,
  ...(process.env.SRK_AWS_ENDPOINT && { endpoint: process.env.SRK_AWS_ENDPOINT }),
});

const manager = new RotationManager({ providerInstance: provider, logger });

manager.events.on('key_activated', (event) => {
  logger.info(`✅ new key active for "${event.secretName}"`);
});
manager.events.on('rotation_failed', (event) => {
  logger.error(`❌ rotation failed for "${event.secretName}"`);
});

logger.info(`rotating "${secretName}" in AWS Secrets Manager (${region})`);
const result = await manager.rotate(secretName);
logger.info(`rotation ${result.success ? 'succeeded' : 'failed'} in ${result.duration}ms`);
