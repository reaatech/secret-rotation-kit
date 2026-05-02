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
  type: 'aws' | 'gcp' | 'vault';

  /** Provider-specific configuration fields. */
  [key: string]: unknown;
}

/** AWS-specific provider configuration. */
export interface AWSProviderConfig extends ProviderConfig {
  type: 'aws';
  /** AWS region. */
  region: string;
  /** Optional custom endpoint (e.g., for LocalStack). */
  endpoint?: string;
}

/** GCP-specific provider configuration. */
export interface GCPProviderConfig extends ProviderConfig {
  type: 'gcp';
  /** GCP project ID. */
  projectId: string;
  /** Optional custom endpoint. */
  endpoint?: string;
}

/** Vault-specific provider configuration. */
export interface VaultProviderConfig extends ProviderConfig {
  type: 'vault';
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
}
