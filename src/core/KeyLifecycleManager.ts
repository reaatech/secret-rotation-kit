import { randomBytes } from "node:crypto";
import type { KeyStore, Logger } from "../interfaces/index.js";
import type { RotationState, SecretKey } from "../types/index.js";

/** Options for creating a new key. */
export interface CreateKeyOptions {
	/** Secret identifier. */
	secretName: string;

	/** Pre-generated key material (encrypted). */
	encryptedMaterial: string;

	/** Key format. */
	format: SecretKey["format"];

	/** Optional validity window end. */
	validUntil?: Date;

	/** Additional metadata. */
	metadata?: Record<string, unknown>;
}

/** Reasons for revoking a key. */
export type RevokeReason =
	| "rotation_complete"
	| "manual_revocation"
	| "compromised"
	| "expired"
	| "failed_rotation";

/**
 * Orchestrates key lifecycle state transitions.
 *
 * State machine:
 * ```
 * create() → pending
 * pending → activate() → active
 * active → activate(new) → expired (old key)
 * active → expire() → expired
 * expired → revoke() → revoked
 * pending → revoke() → revoked
 * pending → markFailed() → failed
 * ```
 */
export class KeyLifecycleManager {
	constructor(
		private readonly keyStore: KeyStore,
		private readonly logger: Logger | undefined,
	) {}

	/**
	 * Create a new key in pending state.
	 */
	async create(options: CreateKeyOptions): Promise<SecretKey> {
		const now = new Date();
		const key: SecretKey = {
			keyId: this.generateKeyId(),
			secretName: options.secretName,
			encryptedMaterial: options.encryptedMaterial,
			format: options.format,
			validFrom: now,
			...(options.validUntil !== undefined && { validUntil: options.validUntil }),
			status: "pending",
			createdAt: now,
			...(options.metadata !== undefined && { metadata: options.metadata }),
		};

		await this.keyStore.save(key);
		this.log("info", "Key created", { secretName: key.secretName, keyId: key.keyId });
		return key;
	}

	/**
	 * Activate a pending key. If another key is active, it moves to expired.
	 *
	 * @param overlapPeriodMs - Optional overlap window (ms) for the old active key.
	 */
	async activate(secretName: string, keyId: string, overlapPeriodMs?: number): Promise<SecretKey> {
		const key = await this.keyStore.get(secretName, keyId);
		if (!key) {
			throw new Error(`Key not found: ${secretName}/${keyId}`);
		}

		if (key.status !== "pending") {
			throw new Error(`Cannot activate key in '${key.status}' state (must be 'pending')`);
		}

		// Move current active key to expired
		const currentActive = await this.keyStore.getActive(secretName);
		if (currentActive) {
			const expiredKey: SecretKey = {
				...currentActive,
				status: "expired",
				validUntil: overlapPeriodMs ? new Date(Date.now() + overlapPeriodMs) : new Date(),
			};
			await this.keyStore.update(expiredKey);
			this.log("info", "Previous key expired", {
				secretName,
				keyId: expiredKey.keyId,
				previousStatus: "active",
				validUntil: expiredKey.validUntil?.toISOString(),
			});
		}

		const activatedKey: SecretKey = {
			...key,
			status: "active",
			rotatedAt: new Date(),
		};

		await this.keyStore.update(activatedKey);
		this.log("info", "Key activated", { secretName, keyId });
		return activatedKey;
	}

	/**
	 * Mark an active or pending key as expired.
	 */
	async expire(secretName: string, keyId: string): Promise<SecretKey> {
		const key = await this.keyStore.get(secretName, keyId);
		if (!key) {
			throw new Error(`Key not found: ${secretName}/${keyId}`);
		}

		if (key.status !== "active" && key.status !== "pending") {
			throw new Error(`Cannot expire key in '${key.status}' state`);
		}

		const expiredKey: SecretKey = {
			...key,
			status: "expired",
			validUntil: new Date(),
		};

		await this.keyStore.update(expiredKey);
		this.log("info", "Key expired", { secretName, keyId });
		return expiredKey;
	}

	/**
	 * Revoke a key (terminal state). Can be called on active, pending, or expired keys.
	 */
	async revoke(
		secretName: string,
		keyId: string,
		reason: RevokeReason = "manual_revocation",
	): Promise<SecretKey> {
		const key = await this.keyStore.get(secretName, keyId);
		if (!key) {
			throw new Error(`Key not found: ${secretName}/${keyId}`);
		}

		if (key.status === "revoked") {
			// Idempotent: already revoked
			return key;
		}

		const revokedKey: SecretKey = {
			...key,
			status: "revoked",
			revokedAt: new Date(),
			validUntil: new Date(),
			metadata: {
				...key.metadata,
				revokeReason: reason,
			},
		};

		await this.keyStore.update(revokedKey);
		this.log("info", "Key revoked", { secretName, keyId, reason });
		return revokedKey;
	}

	/**
	 * Mark a key as failed (terminal state). Allowed from any non-terminal state so the
	 * workflow can record failures that occur after activation (e.g., completeRotation
	 * throwing). For already-terminal keys (failed/revoked), this is a no-op.
	 */
	async markFailed(secretName: string, keyId: string, error: string): Promise<SecretKey> {
		const key = await this.keyStore.get(secretName, keyId);
		if (!key) {
			throw new Error(`Key not found: ${secretName}/${keyId}`);
		}

		if (key.status === "failed" || key.status === "revoked") {
			return key;
		}

		const failedKey: SecretKey = {
			...key,
			status: "failed",
			metadata: {
				...key.metadata,
				failureReason: error,
				failedAt: new Date().toISOString(),
				previousStatus: key.status,
			},
		};

		await this.keyStore.update(failedKey);
		this.log("error", "Key marked as failed", {
			secretName,
			keyId,
			error,
			previousStatus: key.status,
		});
		return failedKey;
	}

	/**
	 * Get the current rotation state for a secret.
	 */
	async getState(secretName: string): Promise<RotationState> {
		const allKeys = await this.keyStore.list(secretName);
		const activeKey = allKeys.find((k) => k.status === "active");
		const state: RotationState = {
			secretName,
			activeKey: activeKey ?? null,
			pendingKeys: allKeys.filter((k) => k.status === "pending"),
			expiredKeys: allKeys.filter((k) => k.status === "expired"),
			revokedKeys: allKeys.filter((k) => k.status === "revoked"),
			failedKeys: allKeys.filter((k) => k.status === "failed"),
			rotationCount: allKeys.filter((k) => k.rotatedAt).length,
		};
		if (activeKey?.rotatedAt) {
			state.lastRotationAt = activeKey.rotatedAt;
		}
		return state;
	}

	private generateKeyId(): string {
		const timestamp = Date.now().toString(36);
		const random = randomBytes(8).toString("hex");
		return `${timestamp}-${random}`;
	}

	private log(
		level: "debug" | "info" | "warn" | "error",
		message: string,
		meta?: Record<string, unknown>,
	): void {
		this.logger?.[level](message, meta);
	}
}
