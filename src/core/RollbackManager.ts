import { randomBytes } from "node:crypto";
import type { EventEmitter, KeyStore, Logger, SecretProvider } from "../interfaces/index.js";
import type { RotationSession, SecretKey } from "../types/index.js";
import { KeyLifecycleManager } from "./KeyLifecycleManager.js";
import { RotationError } from "./errors.js";

export interface RollbackEntry {
	id: string;
	secretName: string;
	previousActiveKeyId: string | null;
	newKeyId: string;
	session: RotationSession | null;
	startedAt: Date;
	completed: boolean;
	error?: string;
}

export interface RollbackResult {
	success: boolean;
	entry: RollbackEntry;
	duration: number;
}

/**
 * Manages automatic and manual rollback of failed rotations.
 *
 * On rotation failure, rolls back by:
 * 1. Cancelling the provider rotation session (best-effort)
 * 2. Marking the new key as failed
 * 3. Reactivating the previous active key if possible
 */
export class RollbackManager {
	private entries: RollbackEntry[] = [];
	private readonly maxEntries: number;
	private readonly lifecycle: KeyLifecycleManager;

	constructor(
		private provider: SecretProvider,
		private keyStore: KeyStore,
		private eventEmitter: EventEmitter | undefined,
		private logger: Logger | undefined,
		maxEntries = 100,
	) {
		this.maxEntries = maxEntries;
		this.lifecycle = new KeyLifecycleManager(keyStore, logger);
	}

	/**
	 * Record a rotation attempt before execution begins.
	 */
	startRotation(
		secretName: string,
		newKeyId: string,
		previousActiveKeyId: string | null,
		session: RotationSession | null,
	): RollbackEntry {
		const entry: RollbackEntry = {
			id: this.generateId(),
			secretName,
			previousActiveKeyId,
			newKeyId,
			session,
			startedAt: new Date(),
			completed: false,
		};
		this.entries.push(entry);
		if (this.entries.length > this.maxEntries) {
			this.entries = this.entries.slice(-this.maxEntries);
		}
		return entry;
	}

	/**
	 * Mark a rotation entry as successfully completed.
	 */
	markComplete(entryId: string): void {
		const entry = this.entries.find((e) => e.id === entryId);
		if (entry) entry.completed = true;
	}

	/**
	 * Execute a rollback for a failed rotation.
	 *
	 * @param entry - The rotation entry to roll back.
	 * @param error - The error that caused the failure.
	 * @returns Rollback result.
	 */
	async rollback(entry: RollbackEntry, error: string): Promise<RollbackResult> {
		const startTime = Date.now();
		this.logger?.info("Starting rollback", {
			entryId: entry.id,
			secretName: entry.secretName,
			newKeyId: entry.newKeyId,
		});

		try {
			let reactivationFailed = false;

			if (entry.session) {
				try {
					await this.provider.cancelRotation(entry.session);
				} catch (cancelError) {
					this.logger?.warn("Rollback: cancel rotation failed (non-fatal)", {
						entryId: entry.id,
						error: cancelError instanceof Error ? cancelError.message : String(cancelError),
					});
				}
			}

			try {
				await this.lifecycle.markFailed(entry.secretName, entry.newKeyId, error);
			} catch (markFailedError) {
				this.logger?.warn("Rollback: mark failed skipped (non-fatal)", {
					entryId: entry.id,
				});
			}

			if (entry.previousActiveKeyId) {
				try {
					await this.reactivateKey(entry.secretName, entry.previousActiveKeyId);
				} catch (reactivateError) {
					reactivationFailed = true;
					this.logger?.error("Rollback: reactivate previous key failed", {
						entryId: entry.id,
						keyId: entry.previousActiveKeyId,
						error:
							reactivateError instanceof Error ? reactivateError.message : String(reactivateError),
					});
				}
			}

			const duration = Date.now() - startTime;
			if (reactivationFailed) {
				this.logger?.error("Rollback partially completed: reactivation failed", {
					entryId: entry.id,
					duration,
				});
				return {
					success: false,
					entry: { ...entry, error: "Reactivation of previous key failed" },
					duration,
				};
			}

			this.logger?.info("Rollback completed", {
				entryId: entry.id,
				duration,
			});

			return {
				success: true,
				entry,
				duration,
			};
		} catch (err) {
			const duration = Date.now() - startTime;
			const message = err instanceof Error ? err.message : String(err);
			this.logger?.error("Rollback failed", {
				entryId: entry.id,
				error: message,
			});

			return {
				success: false,
				entry: { ...entry, error: message },
				duration,
			};
		}
	}

	/**
	 * Execute a rollback for a simple error (no pre-recorded entry).
	 */
	async rollbackSimple(
		secretName: string,
		newKeyId: string,
		previousActiveKeyId: string | null,
		session: RotationSession | null,
		error: string,
	): Promise<RollbackResult> {
		const entry = this.startRotation(secretName, newKeyId, previousActiveKeyId, session);
		return this.rollback(entry, error);
	}

	/**
	 * Get all recorded rollback entries.
	 */
	getEntries(): ReadonlyArray<RollbackEntry> {
		return this.entries;
	}

	/**
	 * Get a specific rollback entry by ID.
	 */
	getEntry(entryId: string): RollbackEntry | undefined {
		return this.entries.find((e) => e.id === entryId);
	}

	private async reactivateKey(secretName: string, keyId: string): Promise<void> {
		const key = await this.keyStore.get(secretName, keyId);
		if (!key) {
			throw new RotationError(
				`Cannot reactivate: key not found: ${secretName}/${keyId}`,
				"activation",
				false,
			);
		}

		if (key.status === "revoked" || key.status === "failed") {
			throw new RotationError(
				`Cannot reactivate key in '${key.status}' state: ${secretName}/${keyId}`,
				"activation",
				false,
			);
		}

		const { validUntil: _vu, ...rest } = key;
		const activeKey: SecretKey = {
			...rest,
			status: "active",
			rotatedAt: new Date(),
		};
		await this.keyStore.update(activeKey);
		this.logger?.info("Key reactivated during rollback", { secretName, keyId });
	}

	private generateId(): string {
		return `rb-${Date.now().toString(36)}-${randomBytes(8).toString("hex")}`;
	}
}
