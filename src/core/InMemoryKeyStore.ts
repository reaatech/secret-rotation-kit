import type { KeyStore } from "../interfaces/index.js";
import type { SecretKey } from "../types/index.js";
import { PerKeyLock } from "./PerKeyLock.js";

/**
 * Thread-safe in-memory key store with per-secret async locking.
 *
 * Uses a queue-based lock to ensure atomic operations without external
 * dependencies.
 */
export class InMemoryKeyStore implements KeyStore {
	private store: Map<string, Map<string, SecretKey>> = new Map();
	private lock: PerKeyLock = new PerKeyLock();

	async save(key: SecretKey): Promise<void> {
		await this.lock.withLock(key.secretName, () => {
			if (!this.store.has(key.secretName)) {
				this.store.set(key.secretName, new Map());
			}
			this.store.get(key.secretName)?.set(key.keyId, key);
		});
	}

	async get(secretName: string, keyId: string): Promise<SecretKey | null> {
		return this.lock.withLock(secretName, () => {
			return this.store.get(secretName)?.get(keyId) ?? null;
		});
	}

	async getActive(secretName: string): Promise<SecretKey | null> {
		return this.lock.withLock(secretName, () => {
			const keys = this.store.get(secretName);
			if (!keys) return null;

			const activeKeys = Array.from(keys.values())
				.filter((k) => k.status === "active")
				.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

			return activeKeys[0] ?? null;
		});
	}

	async getValid(secretName: string, at = new Date()): Promise<SecretKey[]> {
		return this.lock.withLock(secretName, () => {
			const keys = this.store.get(secretName);
			if (!keys) return [];

			return Array.from(keys.values())
				.filter((k) => {
					if (k.status === "revoked" || k.status === "failed") return false;
					if (k.validUntil && k.validUntil < at) return false;
					return k.validFrom <= at;
				})
				.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
		});
	}

	async update(key: SecretKey): Promise<void> {
		await this.lock.withLock(key.secretName, () => {
			const secretStore = this.store.get(key.secretName);
			if (!secretStore || !secretStore.has(key.keyId)) {
				throw new Error(`Key not found: ${key.secretName}/${key.keyId}`);
			}
			secretStore.set(key.keyId, key);
		});
	}

	async delete(secretName: string, keyId: string): Promise<void> {
		await this.lock.withLock(secretName, () => {
			this.store.get(secretName)?.delete(keyId);
		});
	}

	async list(secretName?: string): Promise<SecretKey[]> {
		if (secretName) {
			return this.lock.withLock(secretName, () => {
				const keys = this.store.get(secretName);
				return keys ? Array.from(keys.values()) : [];
			});
		}

		// No secretName: list all keys across all secrets
		const result: SecretKey[] = [];
		for (const secretName of this.store.keys()) {
			const keys = await this.list(secretName);
			result.push(...keys);
		}
		return result;
	}

	/**
	 * Returns a snapshot of the entire store for testing or debugging.
	 * Does not hold locks to avoid deadlocks with active operations.
	 */
	snapshot(): Record<string, SecretKey[]> {
		const result: Record<string, SecretKey[]> = {};
		for (const [name, keys] of this.store) {
			result[name] = Array.from(keys.values());
		}
		return result;
	}

	/**
	 * Clears all stored keys. Useful for testing.
	 */
	async clear(): Promise<void> {
		for (const secretName of this.store.keys()) {
			await this.lock.withLock(secretName, () => {
				this.store.get(secretName)?.clear();
			});
		}
		this.store.clear();
	}
}
