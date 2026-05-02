import { randomBytes } from 'node:crypto';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import type {
  DeleteOptions,
  GCPProviderConfig,
  ProviderCapabilities,
  ProviderHealth,
  RotationSession,
  SecretProvider,
  SecretValue,
  SecretVersion,
} from '@reaatech/secret-rotation-types';

/**
 * GCP Secret Manager provider adapter.
 *
 * GCP doesn't have native rotation stages, so we use labels to track
 * rotation state (`rotation-status`, `pending-version`).
 */
export class GCPProvider implements SecretProvider {
  name = 'gcp-secret-manager';
  priority = 2;

  private client: SecretManagerServiceClient;
  private projectId: string;

  constructor(config: GCPProviderConfig) {
    this.client = new SecretManagerServiceClient(
      config.endpoint ? { apiEndpoint: config.endpoint } : undefined,
    );
    this.projectId = config.projectId;
  }

  async createSecret(name: string, value: string): Promise<void> {
    const parent = `projects/${this.projectId}`;
    const [secret] = await this.client.createSecret({
      parent,
      secretId: name,
      secret: {
        replication: {
          automatic: {},
        },
      },
    });

    if (secret.name) {
      await this.client.addSecretVersion({
        parent: secret.name,
        payload: {
          data: Buffer.from(value, 'utf-8'),
        },
      });
    }
  }

  async getSecret(name: string, version?: string): Promise<SecretValue> {
    const versionName = version
      ? `projects/${this.projectId}/secrets/${name}/versions/${version}`
      : `projects/${this.projectId}/secrets/${name}/versions/latest`;

    const [response] = await this.client.accessSecretVersion({
      name: versionName,
    });

    const payload = response.payload?.data;
    const value = payload ? Buffer.from(payload).toString('utf-8') : '';

    return {
      value,
      versionId: response.name ?? '',
      createdAt: new Date(), // accessSecretVersion response doesn't include createTime
    };
  }

  async storeSecretValue(
    name: string,
    value: string,
    _options?: { stage?: 'current' | 'pending' },
  ): Promise<SecretValue> {
    // GCP Secret Manager always returns the latest enabled version when a version is not
    // specified. Pending vs. current is tracked via the "rotation-status" label on the
    // secret (set by beginRotation / cleared by completeRotation), not on the version.
    const parent = `projects/${this.projectId}/secrets/${name}`;
    const [version] = await this.client.addSecretVersion({
      parent,
      payload: {
        data: Buffer.from(value, 'utf-8'),
      },
    });

    return {
      value,
      versionId: version.name ?? '',
      createdAt: version.createTime
        ? this.timestampToDate(
            version.createTime as { seconds?: string | number | null; nanos?: number | null },
          )
        : new Date(),
    };
  }

  async deleteSecret(name: string, options?: DeleteOptions): Promise<void> {
    const secretName = `projects/${this.projectId}/secrets/${name}`;
    await this.client.deleteSecret({
      name: secretName,
      ...(options?.permanent && { etag: '' }),
    });
  }

  async listVersions(name: string): Promise<SecretVersion[]> {
    const parent = `projects/${this.projectId}/secrets/${name}`;
    const [versions] = await this.client.listSecretVersions({ parent });

    return (
      versions.map((v) => ({
        versionId: v.name ?? '',
        createdAt: v.createTime
          ? this.timestampToDate(
              v.createTime as { seconds?: string | number | null; nanos?: number | null },
            )
          : new Date(),
        ...(v.state !== undefined && { stages: [String(v.state)] }),
      })) ?? []
    );
  }

  async getVersion(name: string, versionId: string): Promise<SecretValue> {
    // versionId from GCP is a full path like projects/.../secrets/.../versions/1
    // If it's just a number, construct the full path
    const fullVersionName = versionId.includes('/')
      ? versionId
      : `projects/${this.projectId}/secrets/${name}/versions/${versionId}`;

    const [response] = await this.client.accessSecretVersion({
      name: fullVersionName,
    });

    const payload = response.payload?.data;
    const value = payload ? Buffer.from(payload).toString('utf-8') : '';

    return {
      value,
      versionId: response.name ?? '',
      createdAt: new Date(),
    };
  }

  async deleteVersion(name: string, versionId: string): Promise<void> {
    const fullVersionName = versionId.includes('/')
      ? versionId
      : `projects/${this.projectId}/secrets/${name}/versions/${versionId}`;

    await this.client.destroySecretVersion({ name: fullVersionName });
  }

  supportsRotation(): boolean {
    return true;
  }

  async beginRotation(name: string): Promise<RotationSession> {
    // Mark the secret as having an in-progress rotation. The actual pending version
    // is created by the workflow via storeSecretValue and recorded in session.state.
    const secretName = `projects/${this.projectId}/secrets/${name}`;
    await this.client.updateSecret({
      secret: {
        name: secretName,
        labels: {
          'rotation-status': 'pending',
        },
      },
      updateMask: { paths: ['labels'] },
    });

    return {
      sessionId: this.generateSessionId(),
      secretName: name,
      provider: this.name,
      state: { metadata: { status: 'pending' } },
      startedAt: new Date(),
    };
  }

  async completeRotation(session: RotationSession): Promise<void> {
    const secretName = `projects/${this.projectId}/secrets/${session.secretName}`;
    const [secret] = await this.client.getSecret({ name: secretName });
    const { 'rotation-status': _, ...labels } = secret.labels ?? {};
    await this.client.updateSecret({
      secret: {
        name: secretName,
        labels,
      },
      updateMask: { paths: ['labels'] },
    });
  }

  async cancelRotation(session: RotationSession): Promise<void> {
    if (session.state.versionId) {
      try {
        await this.deleteVersion(session.secretName, session.state.versionId);
      } catch {
        // Version may not exist or already be destroyed.
      }
    }
    await this.completeRotation(session);
  }

  async health(): Promise<ProviderHealth> {
    try {
      const start = Date.now();
      await this.client.listSecrets({
        parent: `projects/${this.projectId}`,
        pageSize: 1,
      });
      return {
        status: 'healthy',
        latency: Date.now() - start,
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: 0,
        lastChecked: new Date(),
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsRotation: true,
      supportsVersioning: true,
      supportsLabels: true,
      maxVersions: 1000,
    };
  }

  private generateSessionId(): string {
    return `gcp-rot-${Date.now().toString(36)}-${randomBytes(16).toString('hex')}`;
  }

  private timestampToDate(timestamp: {
    seconds?: string | number | null;
    nanos?: number | null;
  }): Date {
    const seconds =
      typeof timestamp.seconds === 'string'
        ? Number.parseInt(timestamp.seconds, 10)
        : (timestamp.seconds ?? 0);
    const nanos = timestamp.nanos ?? 0;
    return new Date(seconds * 1000 + nanos / 1_000_000);
  }
}
