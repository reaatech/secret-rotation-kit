import { randomBytes } from 'node:crypto';
import type {
  DeleteOptions,
  ProviderCapabilities,
  ProviderHealth,
  RotationSession,
  SecretProvider,
  SecretValue,
  SecretVersion,
  VercelEnvTarget,
  VercelProviderConfig,
  VercelProviderOptions,
} from '@reaatech/secret-rotation-types';

/** Minimal shape of a Vercel environment variable object. */
interface VercelEnv {
  id: string;
  key: string;
  value: string;
  type: string;
  target?: VercelEnvTarget[] | VercelEnvTarget;
  comment?: string;
  createdAt?: number;
  updatedAt?: number;
  decrypted?: boolean;
}

interface CreateEnvResponse {
  created: VercelEnv | VercelEnv[];
  failed: Array<{ error: { code: string; message: string } }>;
}

const DEFAULT_API_BASE_URL = 'https://api.vercel.com';
const COMMENT_ACTIVE = 'Managed by secret-rotation-kit';
const COMMENT_PENDING = 'Managed by secret-rotation-kit (rotating)';

/**
 * Vercel project environment variable provider.
 *
 * Vercel exposes secrets as project environment variables. Unlike AWS/GCP/Vault
 * there is no native versioning or staging: a key has a single value per target,
 * and the env var `id` is stable across updates. This provider therefore:
 *
 * - uses the env var `id` as the version identifier (so propagation verification,
 *   which re-reads `getSecret(name, versionId)`, succeeds once the value is live);
 * - captures the previous value in the rotation session so {@link cancelRotation}
 *   can restore it (Vercel keeps no history);
 * - writes with the `encrypted` type by default so values are readable for
 *   verification (`sensitive` env vars are write-only).
 *
 * Note: env var changes take effect on the next Vercel deployment. The provider
 * confirms the new value is readable via the API; live propagation to running
 * deployments depends on a redeploy.
 *
 * Uses the global `fetch` (Node.js >= 20) — no SDK dependency.
 */
export class VercelProvider implements SecretProvider {
  name = 'vercel-env';
  priority = 4;

  private readonly fetchImpl: typeof fetch;
  private readonly token: string;
  private readonly projectId: string;
  private readonly teamId: string | undefined;
  private readonly target: VercelEnvTarget[];
  private readonly envType: 'encrypted' | 'sensitive';
  private readonly baseUrl: string;

  /**
   * Static factory that accepts a custom `fetch` implementation (e.g. for tests
   * or a proxy). Falls back to the global `fetch` otherwise.
   */
  static create(config: VercelProviderConfig, fetchImpl: typeof fetch): VercelProvider {
    return new VercelProvider(config, fetchImpl);
  }

  constructor(config: VercelProviderOptions, fetchImpl?: typeof fetch) {
    if (!config.token) throw new Error('VercelProvider requires a "token".');
    if (!config.projectId) throw new Error('VercelProvider requires a "projectId".');
    this.token = config.token;
    this.projectId = config.projectId;
    this.teamId = config.teamId;
    this.target = config.target?.length ? config.target : ['production'];
    this.envType = config.envType ?? 'encrypted';
    this.baseUrl = config.apiBaseUrl ?? DEFAULT_API_BASE_URL;
    this.fetchImpl = fetchImpl ?? globalThis.fetch;
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('No fetch implementation available. Use Node.js >= 20 or pass one in.');
    }
  }

  async createSecret(name: string, value: string): Promise<void> {
    const response = await this.api<CreateEnvResponse>('POST', this.envPath(), {
      body: {
        key: name,
        value,
        type: this.envType,
        target: this.target,
        comment: COMMENT_ACTIVE,
      },
    });
    this.assertNoFailures(response, name);
  }

  async getSecret(name: string, version?: string): Promise<SecretValue> {
    const env = await this.findEnv(name, version);
    if (!env) {
      throw new Error(`Secret "${name}" not found in Vercel project ${this.projectId}`);
    }
    return this.toSecretValue(env);
  }

  async storeSecretValue(
    name: string,
    value: string,
    options?: { stage?: 'current' | 'pending' },
  ): Promise<SecretValue> {
    const response = await this.api<CreateEnvResponse>('POST', this.envPath(), {
      query: { upsert: 'true' },
      body: {
        key: name,
        value,
        type: this.envType,
        target: this.target,
        comment: options?.stage === 'pending' ? COMMENT_PENDING : COMMENT_ACTIVE,
      },
    });
    this.assertNoFailures(response, name);
    const created = Array.isArray(response.created) ? response.created[0] : response.created;
    if (!created) throw new Error(`Vercel did not return the stored env var for "${name}"`);
    return this.toSecretValue(created, value);
  }

  async deleteSecret(name: string, _options?: DeleteOptions): Promise<void> {
    const env = await this.findEnv(name);
    if (env) {
      await this.api<void>('DELETE', this.envPath(env.id));
    }
  }

  async listVersions(name: string): Promise<SecretVersion[]> {
    const envs = await this.listEnvs(false);
    return envs
      .filter((e) => e.key === name && this.matchesTarget(e))
      .map((e) => ({
        versionId: e.id,
        createdAt: e.createdAt ? new Date(e.createdAt) : new Date(),
        stages: this.normalizeTargets(e),
      }));
  }

  async getVersion(name: string, versionId: string): Promise<SecretValue> {
    return this.getSecret(name, versionId);
  }

  async deleteVersion(_name: string, versionId: string): Promise<void> {
    await this.api<void>('DELETE', this.envPath(versionId));
  }

  supportsRotation(): boolean {
    return true;
  }

  async beginRotation(name: string): Promise<RotationSession> {
    // Capture the current value so cancelRotation can restore it — Vercel keeps
    // no version history once a value is overwritten.
    let previousValue: string | undefined;
    let previousVersionId: string | undefined;
    try {
      const current = await this.getSecret(name);
      previousValue = current.value;
      previousVersionId = current.versionId;
    } catch {
      // Secret does not exist yet; nothing to restore on cancel.
    }

    return {
      sessionId: this.generateSessionId(),
      secretName: name,
      provider: this.name,
      state: {
        metadata: {
          existed: previousValue !== undefined,
          ...(previousValue !== undefined && { previousValue }),
          ...(previousVersionId && { previousVersionId }),
        },
      },
      startedAt: new Date(),
    };
  }

  async completeRotation(session: RotationSession): Promise<void> {
    const id = session.state.versionId;
    if (!id) return;
    // Clear the "rotating" marker now that the new value is active.
    await this.api<VercelEnv>('PATCH', this.envPath(id), {
      body: { comment: COMMENT_ACTIVE },
    });
  }

  async cancelRotation(session: RotationSession): Promise<void> {
    const meta = session.state.metadata ?? {};
    const id = session.state.versionId ?? (meta.previousVersionId as string | undefined);
    if (!id) return;

    if (meta.existed && typeof meta.previousValue === 'string') {
      // Restore the previous value.
      await this.api<VercelEnv>('PATCH', this.envPath(id), {
        body: { value: meta.previousValue, comment: COMMENT_ACTIVE },
      });
    } else {
      // The secret was created during this rotation — remove it.
      await this.api<void>('DELETE', this.envPath(id)).catch(() => {});
    }
  }

  async health(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      await this.listEnvs(false);
      return { status: 'healthy', latency: Date.now() - start, lastChecked: new Date() };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: Date.now() - start,
        lastChecked: new Date(),
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsRotation: true,
      supportsVersioning: false,
      supportsLabels: false,
      maxVersions: 1,
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private envPath(id?: string): string {
    const project = encodeURIComponent(this.projectId);
    return id
      ? `/v9/projects/${project}/env/${encodeURIComponent(id)}`
      : `/v10/projects/${project}/env`;
  }

  private async listEnvs(decrypt: boolean): Promise<VercelEnv[]> {
    const response = await this.api<VercelEnv[] | { envs: VercelEnv[] }>('GET', this.envPath(), {
      query: { decrypt: decrypt ? 'true' : undefined },
    });
    if (Array.isArray(response)) return response;
    return response.envs ?? [];
  }

  private async findEnv(name: string, version?: string): Promise<VercelEnv | undefined> {
    const envs = await this.listEnvs(true);
    return envs.find((e) => (version ? e.id === version : e.key === name && this.matchesTarget(e)));
  }

  private normalizeTargets(env: VercelEnv): VercelEnvTarget[] {
    if (Array.isArray(env.target)) return env.target;
    return env.target ? [env.target] : [];
  }

  private matchesTarget(env: VercelEnv): boolean {
    const targets = this.normalizeTargets(env);
    if (targets.length === 0) return true;
    return this.target.some((t) => targets.includes(t));
  }

  private toSecretValue(env: VercelEnv, fallbackValue?: string): SecretValue {
    return {
      value: env.value ?? fallbackValue ?? '',
      versionId: env.id,
      createdAt: env.createdAt ? new Date(env.createdAt) : new Date(),
      versionStages: this.normalizeTargets(env),
    };
  }

  private assertNoFailures(response: CreateEnvResponse, name: string): void {
    if (response.failed && response.failed.length > 0) {
      const messages = response.failed.map((f) => f.error.message).join('; ');
      throw new Error(`Vercel failed to store "${name}": ${messages}`);
    }
  }

  private async api<T>(
    method: string,
    path: string,
    opts: { query?: Record<string, string | undefined>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (this.teamId) url.searchParams.set('teamId', this.teamId);
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }

    const response = await this.fetchImpl(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Vercel API ${method} ${path} failed (${response.status}): ${text}`);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  private generateSessionId(): string {
    return `vercel-rot-${Date.now().toString(36)}-${randomBytes(16).toString('hex')}`;
  }
}
