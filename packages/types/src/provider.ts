/**
 * Types related to secret provider adapters.
 */

/** Options for deleting a secret or version. */
export interface DeleteOptions {
  /** Force deletion even if the secret is in use. */
  force?: boolean;

  /** Permanently delete (bypass soft-delete / trash). */
  permanent?: boolean;
}

/** Represents a secret value returned by a provider. */
export interface SecretValue {
  /** The secret value. */
  value: string;

  /** Provider version identifier. */
  versionId: string;

  /** Provider version stages. */
  versionStages?: string[];

  /** When this version was created. */
  createdAt: Date;

  /** Provider-specific metadata. */
  metadata?: Record<string, unknown>;
}

/** Represents a single version of a secret in the provider. */
export interface SecretVersion {
  /** Provider version identifier. */
  versionId: string;

  /** When this version was created. */
  createdAt: Date;

  /** Version stages (e.g., AWSCURRENT). */
  stages?: string[];

  /** Provider-specific metadata. */
  metadata?: Record<string, unknown>;
}

/** Health status of a provider connection. */
export interface ProviderHealth {
  /** Overall health status. */
  status: 'healthy' | 'degraded' | 'unhealthy';

  /** Last observed latency in milliseconds. */
  latency: number;

  /** When health was last checked. */
  lastChecked: Date;

  /** Optional status message. */
  message?: string;
}

/** Capabilities advertised by a provider. */
export interface ProviderCapabilities {
  /** Provider supports rotation workflows. */
  supportsRotation: boolean;

  /** Provider supports secret versioning. */
  supportsVersioning: boolean;

  /** Provider supports labels / tags on secrets. */
  supportsLabels: boolean;

  /** Maximum number of versions retained by the provider. */
  maxVersions?: number;
}

/** Base configuration for all providers. */
export interface ProviderConfig {
  /** Provider type discriminator. */
  type: 'aws' | 'gcp' | 'vault' | 'vercel';

  /** Provider-specific configuration fields. */
  [key: string]: unknown;
}

// The `*Options` interfaces below are what each provider's constructor accepts.
// They are identical to the matching `*Config` except the `type` discriminator
// is optional: it is only meaningful to the provider factory (`createProvider`),
// which uses it to pick a class. When you construct a provider directly you have
// already chosen the class, so `type` is redundant.

/** Options for constructing {@link AWSProvider} directly. */
export interface AWSProviderOptions {
  /** Provider discriminator. Only required when using `createProvider`. */
  type?: 'aws';
  /** AWS region. */
  region: string;
  /** Optional custom endpoint (e.g., for LocalStack). */
  endpoint?: string;
  [key: string]: unknown;
}

/** AWS-specific provider configuration (factory form, `type` required). */
export interface AWSProviderConfig extends AWSProviderOptions, ProviderConfig {
  type: 'aws';
}

/** Options for constructing {@link GCPProvider} directly. */
export interface GCPProviderOptions {
  /** Provider discriminator. Only required when using `createProvider`. */
  type?: 'gcp';
  /** GCP project ID. */
  projectId: string;
  /** Optional custom endpoint. */
  endpoint?: string;
  [key: string]: unknown;
}

/** GCP-specific provider configuration (factory form, `type` required). */
export interface GCPProviderConfig extends GCPProviderOptions, ProviderConfig {
  type: 'gcp';
}

/** Options for constructing {@link VaultProvider} directly. */
export interface VaultProviderOptions {
  /** Provider discriminator. Only required when using `createProvider`. */
  type?: 'vault';
  /** Vault server URL. */
  url: string;
  /** KV engine mount path. */
  mountPath: string;
  /** Authentication token (required for token auth). */
  token?: string;
  /** Role ID for AppRole authentication. */
  roleId?: string;
  /** Secret ID for AppRole authentication. */
  secretId?: string;
  [key: string]: unknown;
}

/** Vault-specific provider configuration (factory form, `type` required). */
export interface VaultProviderConfig extends VaultProviderOptions, ProviderConfig {
  type: 'vault';
}

/** Vercel deployment targets an environment variable can apply to. */
export type VercelEnvTarget = 'production' | 'preview' | 'development';

/** Options for constructing {@link VercelProvider} directly. */
export interface VercelProviderOptions {
  /** Provider discriminator. Only required when using `createProvider`. */
  type?: 'vercel';
  /** Vercel API bearer token (https://vercel.com/account/tokens). */
  token: string;
  /** Project id or name that owns the environment variables. */
  projectId: string;
  /** Team id, required when the project belongs to a team. */
  teamId?: string;
  /** Deployment targets to write to (defaults to `['production']`). */
  target?: VercelEnvTarget[];
  /**
   * Env var type. Defaults to `encrypted` so values can be read back for
   * propagation verification. `sensitive` is write-only and cannot be verified
   * by read-back (use a custom/active verifier in that case).
   */
  envType?: 'encrypted' | 'sensitive';
  /** API base URL (defaults to `https://api.vercel.com`). */
  apiBaseUrl?: string;
  [key: string]: unknown;
}

/** Vercel-specific provider configuration (factory form, `type` required). */
export interface VercelProviderConfig extends VercelProviderOptions, ProviderConfig {
  type: 'vercel';
}
