/**
 * Types related to propagation verification and consumer tracking.
 */

/** Retry policy for operations with transient failures. */
export interface RetryPolicy {
  /** Maximum number of retry attempts. */
  maxRetries: number;

  /** Multiplier for exponential backoff. */
  backoffMultiplier: number;

  /** Initial delay before the first retry, in milliseconds. */
  initialDelayMs: number;

  /** Maximum delay between retries, in milliseconds. */
  maxDelayMs: number;
}

/** Represents a consumer of a secret that must be verified during rotation. */
export interface Consumer {
  /** Unique consumer identifier. */
  id: string;

  /** Consumer endpoint for health checks or version queries. */
  endpoint: string;

  /** List of secret names this consumer is interested in. */
  interestedSecrets: string[];

  /** Consumer groups for staged rollouts. */
  groups?: string[];

  /** Capabilities supported by this consumer. */
  capabilities: ConsumerCapabilities;

  /** Authentication configuration for reaching the consumer. */
  auth?: ConsumerAuthConfig;
}

/** Capabilities that a consumer can advertise for verification purposes. */
export interface ConsumerCapabilities {
  /** Consumer supports direct key version checks via API. */
  supportsVersionCheck: boolean;

  /** Consumer supports health check verification. */
  supportsHealthCheck: boolean;

  /** Consumer supports callback-based confirmation. */
  supportsCallback: boolean;
}

/** Authentication configuration for consumer communication. */
export interface ConsumerAuthConfig {
  /** Authentication type. */
  type: 'bearer' | 'mtls' | 'api-key';

  /** Type-specific credential fields. */
  credentials: Record<string, string>;
}

/** Result of verifying a single consumer. */
export interface ConsumerVerificationResult {
  /** Consumer identifier. */
  consumerId: string;

  /** Whether verification succeeded. */
  success: boolean;

  /** Current key version reported by the consumer. */
  currentVersion?: string;

  /** When verification completed. */
  verifiedAt?: Date;

  /** Error message if verification failed. */
  error?: string;

  /** Whether this consumer can be retried. */
  canRetry: boolean;
}

/** Result of verifying propagation across all consumers. */
export interface VerificationResult {
  /** Whether propagation verification succeeded. */
  success: boolean;

  /** Total number of consumers checked. */
  consumerCount: number;

  /** Number of consumers that passed verification. */
  verifiedCount: number;

  /** Coverage ratio (0–1). */
  coverage: number;

  /** Total verification duration in milliseconds. */
  duration: number;

  /** Failed consumer details. */
  failures: ConsumerVerificationFailure[];

  /** Whether the verification can be retried. */
  canRetry: boolean;

  /** Additional metadata. */
  metadata?: Record<string, unknown>;
}

/** Details about a single consumer verification failure. */
export interface ConsumerVerificationFailure {
  /** Consumer identifier. */
  consumerId: string;

  /** Human-readable failure reason. */
  reason: string;

  /** Whether this consumer can be retried. */
  canRetry: boolean;
}

/** Options that control verification behavior. */
export interface VerificationOptions {
  /** Overall timeout in milliseconds. */
  timeout?: number;

  /** Timeout per consumer in milliseconds. */
  perConsumerTimeout?: number;

  /** Minimum consumer coverage ratio (0–1). */
  minConsumerCoverage?: number;

  /** Minimum new key usage percent for passive verification. */
  minNewKeyUsage?: number;

  /** Error rate threshold for passive verification. */
  errorThreshold?: number;

  /** Retry policy for failed consumers. */
  retryPolicy?: RetryPolicy;

  /** Additional metadata. */
  metadata?: Record<string, unknown>;
}

/** Current status of an in-flight verification. */
export interface VerificationStatus {
  /** Current verification state. */
  state: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

  /** Progress ratio (0–1). */
  progress: number;

  /** Consumers that have been checked. */
  checkedConsumers: string[];

  /** Consumers that failed verification. */
  failedConsumers: string[];

  /** When verification started. */
  startedAt: Date;

  /** Estimated completion time. */
  estimatedCompletionAt?: Date;
}
