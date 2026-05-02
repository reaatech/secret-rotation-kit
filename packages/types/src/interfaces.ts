/**
 * Core interfaces for the Secret Rotation Kit.
 */

import type {
  DeleteOptions,
  ProviderCapabilities,
  ProviderHealth,
  SecretValue,
  SecretVersion,
} from './provider.js';
import type { RotationEvent, RotationSession, SecretKey } from './rotation.js';
import type {
  Consumer,
  VerificationOptions,
  VerificationResult,
  VerificationStatus,
} from './verification.js';

// ── Key Generation ───────────────────────────────────────────────────────────

/** Options for generating a new secret key. */
export interface KeyGenerationOptions {
  /** Secret identifier. */
  secretName: string;

  /** Desired key format. */
  format?: 'base64' | 'hex' | 'pem' | 'raw';

  /** Additional metadata to attach to the key. */
  metadata?: Record<string, unknown>;
}

/** Generates cryptographically secure secret keys. */
export interface KeyGenerator {
  /** Generate a new key. */
  generate(options: KeyGenerationOptions): Promise<SecretKey>;

  /** Validate a key's format and strength. */
  validate(key: SecretKey): boolean;

  /** Encrypt key material at rest. */
  encrypt(key: SecretKey, encryptionKey: string): Promise<SecretKey>;

  /** Decrypt key material. */
  decrypt(key: SecretKey, encryptionKey: string): Promise<SecretKey>;
}

// ── Key Store ────────────────────────────────────────────────────────────────

/** Abstract storage for secret keys. */
export interface KeyStore {
  /** Save a key. */
  save(key: SecretKey): Promise<void>;

  /** Retrieve a specific key version. */
  get(secretName: string, keyId: string): Promise<SecretKey | null>;

  /** Retrieve the currently active key for a secret. */
  getActive(secretName: string): Promise<SecretKey | null>;

  /** Retrieve all valid keys for a secret at a given time. */
  getValid(secretName: string, at?: Date): Promise<SecretKey[]>;

  /** Update an existing key. */
  update(key: SecretKey): Promise<void>;

  /** Delete a key version. */
  delete(secretName: string, keyId: string): Promise<void>;

  /** List all keys for a secret, or all keys if no name is provided. */
  list(secretName?: string): Promise<SecretKey[]>;
}

// ── Secret Provider ──────────────────────────────────────────────────────────

/**
 * Abstract adapter for secret management providers.
 *
 * Providers operate in one of two modes:
 * 1. **Library-managed secrets**: The library generates the value and pushes it
 *    via `storeSecretValue()`.
 * 2. **Provider-managed secrets**: The provider generates the value internally
 *    (e.g., AWS Lambda rotation). The library only orchestrates version stages.
 */
export interface SecretProvider {
  /** Provider name. */
  name: string;

  /** Provider priority (lower = higher priority). */
  priority: number;

  // ── Secret value operations (library-managed mode) ───────────────────────

  /** Create a new secret in the provider. */
  createSecret(name: string, value: string): Promise<void>;

  /** Retrieve the current secret value. */
  getSecret(name: string, version?: string): Promise<SecretValue>;

  /**
   * Store a secret value (creates a new version).
   *
   * @param options.stage - Whether to store as the current value (default) or as a pending
   *   value to be promoted later. Used by rotation workflows to write a new version that is
   *   not yet active until {@link completeRotation} promotes it.
   */
  storeSecretValue(
    name: string,
    value: string,
    options?: { stage?: 'current' | 'pending' },
  ): Promise<SecretValue>;

  /** Delete a secret. */
  deleteSecret(name: string, options?: DeleteOptions): Promise<void>;

  // ── Version management ───────────────────────────────────────────────────

  /** List all versions of a secret. */
  listVersions(name: string): Promise<SecretVersion[]>;

  /** Retrieve a specific version. */
  getVersion(name: string, versionId: string): Promise<SecretValue>;

  /** Delete a specific version. */
  deleteVersion(name: string, versionId: string): Promise<void>;

  // ── Rotation support ─────────────────────────────────────────────────────

  /** Whether this provider supports rotation workflows. */
  supportsRotation(): boolean;

  /** Begin a rotation session. */
  beginRotation(name: string): Promise<RotationSession>;

  /** Complete a rotation session. */
  completeRotation(session: RotationSession): Promise<void>;

  /** Cancel a rotation session. */
  cancelRotation(session: RotationSession): Promise<void>;

  // ── Health and capabilities ──────────────────────────────────────────────

  /** Check provider health. */
  health(): Promise<ProviderHealth>;

  /** Get provider capabilities. */
  capabilities(): ProviderCapabilities;
}

// ── Propagation Verifier ─────────────────────────────────────────────────────

/** Verifies that consumers have picked up a new secret key. */
export interface PropagationVerifier {
  /** Verify propagation for a rotation session. */
  verify(session: RotationSession, options?: VerificationOptions): Promise<VerificationResult>;

  /** Get the current status of an in-flight verification. */
  getVerificationStatus(session: RotationSession): Promise<VerificationStatus>;

  /** Cancel an in-flight verification. */
  cancelVerification(session: RotationSession): Promise<void>;
}

// ── Event System ─────────────────────────────────────────────────────────────

/** Handler function for rotation events. */
export type EventHandler = (event: RotationEvent) => void | Promise<void>;

/** Filters for event replay queries. */
export interface EventFilters {
  /** Filter by event type. */
  eventType?: string;

  /** Filter by secret name. */
  secretName?: string;

  /** Filter by minimum severity. */
  severity?: 'debug' | 'info' | 'warn' | 'error';
}

/** Emits and subscribes to rotation events. */
export interface EventEmitter {
  /** Emit an event. */
  emit(event: RotationEvent): Promise<void>;

  /** Subscribe to events of a specific type. */
  on(eventType: string, handler: EventHandler): void;

  /** Unsubscribe from events. */
  off(eventType: string, handler: EventHandler): void;

  /** Replay events from a point in time. */
  replay(fromTime: Date, filters?: EventFilters): AsyncIterable<RotationEvent>;
}

// ── Logger ───────────────────────────────────────────────────────────────────

/** Structured logger interface. */
export interface Logger {
  /** Log a debug message. */
  debug(message: string, meta?: Record<string, unknown>): void;

  /** Log an info message. */
  info(message: string, meta?: Record<string, unknown>): void;

  /** Log a warning message. */
  warn(message: string, meta?: Record<string, unknown>): void;

  /** Log an error message. */
  error(message: string, meta?: Record<string, unknown>): void;
}

// ── Consumer Registry ────────────────────────────────────────────────────────

/** Tracks consumers and their health for verification purposes. */
export interface ConsumerRegistry {
  /** Register a consumer. */
  register(consumer: Consumer): Promise<void>;

  /** Deregister a consumer. */
  deregister(consumerId: string): Promise<void>;

  /** Get all healthy consumers interested in a secret. */
  getConsumers(secretName: string): Promise<Consumer[]>;

  /** Get consumer groups for a secret. */
  getConsumerGroups(secretName: string): Promise<ConsumerGroup[]>;
}

/** A group of consumers. */
export interface ConsumerGroup {
  /** Group name. */
  name: string;

  /** Group members. */
  members: Consumer[];

  /** Overall group health status. */
  health: 'healthy' | 'degraded' | 'unhealthy';
}
