import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import type {
  AWSProviderConfig,
  AWSProviderOptions,
  DeleteOptions,
  ProviderCapabilities,
  ProviderHealth,
  RotationSession,
  SecretProvider,
  SecretValue,
  SecretVersion,
} from '@reaatech/secret-rotation-types';

// Type-only imports are erased at build time, so they create no runtime
// dependency on the optional `@aws-sdk/client-secrets-manager` peer.
type AwsSdk = typeof import('@aws-sdk/client-secrets-manager');
type SecretsManagerClient = InstanceType<AwsSdk['SecretsManagerClient']>;

/**
 * AWS Secrets Manager provider adapter.
 *
 * Uses version stages (AWSCURRENT, AWSPENDING, AWSPREVIOUS) for rotation support.
 *
 * `@aws-sdk/client-secrets-manager` is an optional peer dependency; it is loaded
 * lazily so this package can be installed without pulling in the AWS SDK.
 */
export class AWSProvider implements SecretProvider {
  name = 'aws-secrets-manager';
  priority = 1;

  private readonly sdk: AwsSdk;
  private client: SecretsManagerClient;

  /**
   * Static factory that accepts a pre-built `SecretsManagerClient`. Use this
   * when you already have a configured client (e.g. in tests) or want to
   * control credential/region resolution yourself.
   */
  static create(config: AWSProviderConfig, client: SecretsManagerClient): AWSProvider {
    return new AWSProvider(config, client);
  }

  constructor(config: AWSProviderOptions, client?: SecretsManagerClient) {
    let sdk: AwsSdk;
    try {
      const requireFromHere = createRequire(import.meta.url);
      sdk = requireFromHere('@aws-sdk/client-secrets-manager') as AwsSdk;
    } catch (cause) {
      throw new Error(
        'Optional peer dependency "@aws-sdk/client-secrets-manager" is not installed. Install it with:\n  npm install @aws-sdk/client-secrets-manager',
        { cause },
      );
    }
    this.sdk = sdk;
    this.client =
      client ??
      new sdk.SecretsManagerClient({
        region: config.region,
        ...(config.endpoint && { endpoint: config.endpoint }),
      });
  }

  async createSecret(name: string, value: string): Promise<void> {
    const command = new this.sdk.CreateSecretCommand({
      Name: name,
      SecretString: value,
      Description: 'Managed by secret-rotation-kit',
    });
    await this.client.send(command);
  }

  async getSecret(name: string, version?: string): Promise<SecretValue> {
    const command = new this.sdk.GetSecretValueCommand({
      SecretId: name,
      ...(version ? { VersionId: version } : { VersionStage: 'AWSCURRENT' }),
    });
    const response = await this.client.send(command);

    return {
      value: response.SecretString ?? '',
      versionId: response.VersionId ?? '',
      createdAt: response.CreatedDate ? new Date(response.CreatedDate) : new Date(),
      ...(response.VersionStages !== undefined && { versionStages: response.VersionStages }),
    };
  }

  async storeSecretValue(
    name: string,
    value: string,
    options?: { stage?: 'current' | 'pending' },
  ): Promise<SecretValue> {
    const command = new this.sdk.PutSecretValueCommand({
      SecretId: name,
      SecretString: value,
      ...(options?.stage === 'pending' && { VersionStages: ['AWSPENDING'] }),
    });
    const response = await this.client.send(command);

    return {
      value,
      versionId: response.VersionId ?? '',
      createdAt: new Date(),
      ...(response.VersionStages !== undefined && { versionStages: response.VersionStages }),
    };
  }

  async deleteSecret(name: string, options?: DeleteOptions): Promise<void> {
    const command = new this.sdk.DeleteSecretCommand({
      SecretId: name,
      ForceDeleteWithoutRecovery: options?.permanent ?? false,
    });
    await this.client.send(command);
  }

  async listVersions(name: string): Promise<SecretVersion[]> {
    const versions: SecretVersion[] = [];
    let nextToken: string | undefined;

    do {
      const command = new this.sdk.ListSecretVersionIdsCommand({
        SecretId: name,
        IncludeDeprecated: true,
        ...(nextToken && { NextToken: nextToken }),
      });
      const response = await this.client.send(command);

      if (response.Versions) {
        for (const v of response.Versions) {
          versions.push({
            versionId: v.VersionId ?? '',
            createdAt: v.CreatedDate ? new Date(v.CreatedDate) : new Date(),
            ...(v.VersionStages !== undefined && { stages: v.VersionStages }),
          });
        }
      }

      nextToken = response.NextToken;
    } while (nextToken);

    return versions;
  }

  async getVersion(name: string, versionId: string): Promise<SecretValue> {
    return this.getSecret(name, versionId);
  }

  async deleteVersion(name: string, versionId: string): Promise<void> {
    // AWS doesn't support direct version deletion.
    // Remove all staging labels to deprecate the version.
    const versions = await this.listVersions(name);
    const version = versions.find((v) => v.versionId === versionId);
    if (!version) {
      throw new Error(`Version ${versionId} not found for secret ${name}`);
    }

    for (const stage of version.stages ?? []) {
      const command = new this.sdk.UpdateSecretVersionStageCommand({
        SecretId: name,
        VersionStage: stage,
        RemoveFromVersionId: versionId,
      });
      await this.client.send(command);
    }
  }

  supportsRotation(): boolean {
    return true;
  }

  async beginRotation(name: string): Promise<RotationSession> {
    // Do not pre-create a version. The workflow will call storeSecretValue with
    // stage: "pending" and update session.state.versionId from the result.
    return {
      sessionId: this.generateSessionId(),
      secretName: name,
      provider: this.name,
      state: { versionStages: ['AWSPENDING'] },
      startedAt: new Date(),
    };
  }

  async completeRotation(session: RotationSession): Promise<void> {
    if (!session.state.versionId) {
      throw new Error('Cannot complete rotation: session has no versionId');
    }
    // Promote the pending version to AWSCURRENT.
    const command = new this.sdk.UpdateSecretVersionStageCommand({
      SecretId: session.secretName,
      VersionStage: 'AWSCURRENT',
      MoveToVersionId: session.state.versionId,
    });
    await this.client.send(command);
  }

  async cancelRotation(session: RotationSession): Promise<void> {
    if (!session.state.versionId) {
      // Nothing was written; nothing to clean up.
      return;
    }
    // Remove AWSPENDING stage from the version so it is no longer reachable.
    const command = new this.sdk.UpdateSecretVersionStageCommand({
      SecretId: session.secretName,
      VersionStage: 'AWSPENDING',
      RemoveFromVersionId: session.state.versionId,
    });
    await this.client.send(command);
  }

  async health(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const command = new this.sdk.ListSecretVersionIdsCommand({
        SecretId: '__health-check__',
        MaxResults: 1,
      });
      await this.client.send(command);
      return {
        status: 'healthy',
        latency: Date.now() - start,
        lastChecked: new Date(),
      };
    } catch (error) {
      const latency = Date.now() - start;
      if (
        error instanceof Error &&
        (error.name === 'ResourceNotFoundException' || error.message.includes('not found'))
      ) {
        return {
          status: 'healthy',
          latency,
          lastChecked: new Date(),
        };
      }
      return {
        status: 'unhealthy',
        latency,
        lastChecked: new Date(),
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsRotation: true,
      supportsVersioning: true,
      supportsLabels: false,
      maxVersions: 100,
    };
  }

  private generateSessionId(): string {
    return `aws-rot-${Date.now().toString(36)}-${randomBytes(16).toString('hex')}`;
  }
}
