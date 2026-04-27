/**
 * Core type definitions for the Secret Rotation Kit.
 */

/** Valid statuses for a secret key throughout its lifecycle. */
export type KeyStatus =
	| "pending" // Being propagated
	| "active" // Currently in use
	| "expired" // Past validUntil, in grace period
	| "revoked" // No longer valid
	| "failed"; // Propagation failed

/** Supported formats for key material encoding. */
export type KeyFormat = "base64" | "hex" | "pem" | "raw";

/** Valid stages of a rotation workflow. */
export type RotationStage =
	| "generation"
	| "propagation"
	| "verification"
	| "activation"
	| "revocation";

/**
 * Represents a single version of a secret key.
 */
export interface SecretKey {
	/** Unique identifier for this key version. */
	keyId: string;

	/** Secret identifier (e.g., "database-password"). */
	secretName: string;

	/** Encrypted key material. */
	encryptedMaterial: string;

	/** Key format (e.g., "base64", "hex", "pem"). */
	format: KeyFormat;

	/** Validity window start. */
	validFrom: Date;

	/** Validity window end (optional for indefinite validity). */
	validUntil?: Date;

	/** Current key status. */
	status: KeyStatus;

	/** Creation timestamp. */
	createdAt: Date;

	/** Rotation timestamp. */
	rotatedAt?: Date;

	/** Revocation timestamp. */
	revokedAt?: Date;

	/** Arbitrary metadata. */
	metadata?: Record<string, unknown>;
}

/**
 * Provider-specific state attached to a secret version.
 */
export interface ProviderState {
	/** Provider-specific version identifier. */
	versionId?: string;

	/** Provider version stages (e.g., AWSCURRENT, AWSPENDING). */
	versionStages?: string[];

	/** Provider-specific metadata. */
	metadata?: Record<string, unknown>;
}

/**
 * Represents the complete rotation state for a single secret.
 */
export interface RotationState {
	/** Secret identifier. */
	secretName: string;

	/** Current active key. */
	activeKey: SecretKey | null;

	/** Keys being propagated. */
	pendingKeys: SecretKey[];

	/** Expired keys in grace period. */
	expiredKeys: SecretKey[];

	/** Revoked keys (for audit). */
	revokedKeys: SecretKey[];

	/** Failed keys (for debugging). */
	failedKeys: SecretKey[];

	/** Last rotation timestamp. */
	lastRotationAt?: Date;

	/** Next scheduled rotation timestamp. */
	nextRotationAt?: Date;

	/** Total number of rotations performed. */
	rotationCount: number;

	/** Provider state snapshot. */
	providerState?: ProviderState;
}

// ── Rotation Session ─────────────────────────────────────────────────────────

/** Represents an in-progress rotation session with a provider. */
export interface RotationSession {
	/** Unique session identifier. */
	sessionId: string;

	/** Secret being rotated. */
	secretName: string;

	/** Provider name. */
	provider: string;

	/** Provider-specific state. */
	state: ProviderState;

	/** When the session started. */
	startedAt: Date;
}

// ── Rotation Events ──────────────────────────────────────────────────────────

/** Union of all rotation event types. */
export type RotationEvent =
	| KeyGeneratedEvent
	| KeyPropagatedEvent
	| KeyVerifiedEvent
	| KeyActivatedEvent
	| KeyRevokedEvent
	| RotationFailedEvent;

/** Event emitted when a new key is generated. */
export interface KeyGeneratedEvent {
	type: "key_generated";
	secretName: string;
	keyId: string;
	timestamp: Date;
	metadata?: Record<string, unknown>;
}

/** Event emitted when a key is propagated to the provider. */
export interface KeyPropagatedEvent {
	type: "key_propagated";
	secretName: string;
	keyId: string;
	provider: string;
	timestamp: Date;
	propagationTime: number;
	metadata?: Record<string, unknown>;
}

/** Event emitted when propagation is verified. */
export interface KeyVerifiedEvent {
	type: "key_verified";
	secretName: string;
	keyId: string;
	consumerCount: number;
	verificationTime: number;
	timestamp: Date;
	metadata?: Record<string, unknown>;
}

/** Event emitted when a new key becomes active. */
export interface KeyActivatedEvent {
	type: "key_activated";
	secretName: string;
	keyId: string;
	previousKeyId?: string;
	timestamp: Date;
	metadata?: Record<string, unknown>;
}

/** Event emitted when an old key is revoked. */
export interface KeyRevokedEvent {
	type: "key_revoked";
	secretName: string;
	keyId: string;
	reason: string;
	timestamp: Date;
}

/** Event emitted when a rotation fails. */
export interface RotationFailedEvent {
	type: "rotation_failed";
	secretName: string;
	keyId?: string;
	error: string;
	stage: RotationStage;
	timestamp: Date;
	canRetry: boolean;
	metadata?: Record<string, unknown>;
}
