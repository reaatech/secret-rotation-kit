import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "../interfaces/index.js";
import type { KeyStore } from "../interfaces/index.js";
import type { SecretKey } from "../types/index.js";
import { PerKeyLock } from "./PerKeyLock.js";

/** AES-GCM IV length in bytes. NIST SP 800-38D recommends 12 bytes for AES-GCM. */
const IV_LENGTH = 12;

/** AES-256-GCM auth tag length in bytes. */
const AUTH_TAG_LENGTH = 16;

/** AES-256-GCM key length in bytes. */
const AES_KEY_LENGTH = 32;

/** File permissions: owner read/write only. */
const FILE_MODE = 0o600;
/** Directory permissions: owner read/write/execute. */
const DIR_MODE = 0o700;

/** Options for FileSystemKeyStore. */
export interface FileSystemKeyStoreOptions {
	/** Base directory for secret files. */
	baseDir: string;

	/** Optional base64-encoded 32-byte AES-256-GCM key for file encryption. */
	encryptionKey?: string;

	/** Optional logger. */
	logger?: Logger;
}

/**
 * File-based persistent key store.
 *
 * Stores each secret as a separate JSON file. Supports optional AES-256-GCM
 * encryption of the entire file. Writes are atomic (temp file + rename).
 */
export class FileSystemKeyStore implements KeyStore {
	private readonly baseDir: string;
	private readonly encryptionKey: string | undefined;
	private lock: PerKeyLock = new PerKeyLock();
	private logger: Logger | undefined;

	constructor(options: FileSystemKeyStoreOptions) {
		this.baseDir = options.baseDir;
		this.encryptionKey = options.encryptionKey;
		this.logger = options.logger;
	}

	async save(key: SecretKey): Promise<void> {
		await this.lock.withLock(key.secretName, async () => {
			const keys = await this.readSecretFile(key.secretName);
			keys[key.keyId] = this.serializeKey(key);
			await this.writeSecretFile(key.secretName, keys);
		});
	}

	async get(secretName: string, keyId: string): Promise<SecretKey | null> {
		const keys = await this.readSecretFile(secretName);
		const serialized = keys[keyId];
		return serialized ? this.deserializeKey(serialized) : null;
	}

	async getActive(secretName: string): Promise<SecretKey | null> {
		const keys = await this.readSecretFile(secretName);
		const allKeys = Object.values(keys).map((k) => this.deserializeKey(k));
		const activeKeys = allKeys
			.filter((k) => k.status === "active")
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
		return activeKeys[0] ?? null;
	}

	async getValid(secretName: string, at = new Date()): Promise<SecretKey[]> {
		const keys = await this.readSecretFile(secretName);
		return Object.values(keys)
			.map((k) => this.deserializeKey(k))
			.filter((k) => {
				if (k.status === "revoked" || k.status === "failed") return false;
				if (k.validUntil && k.validUntil < at) return false;
				return k.validFrom <= at;
			})
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	}

	async update(key: SecretKey): Promise<void> {
		await this.lock.withLock(key.secretName, async () => {
			const keys = await this.readSecretFile(key.secretName);
			if (!keys[key.keyId]) {
				throw new Error(`Key not found: ${key.secretName}/${key.keyId}`);
			}
			keys[key.keyId] = this.serializeKey(key);
			await this.writeSecretFile(key.secretName, keys);
		});
	}

	async delete(secretName: string, keyId: string): Promise<void> {
		await this.lock.withLock(secretName, async () => {
			const keys = await this.readSecretFile(secretName);
			delete keys[keyId];
			await this.writeSecretFile(secretName, keys);
		});
	}

	async list(secretName?: string): Promise<SecretKey[]> {
		if (secretName) {
			const keys = await this.readSecretFile(secretName);
			return Object.values(keys).map((k) => this.deserializeKey(k));
		}

		// List all secrets by reading every file directly. We can't reconstruct the secret
		// name from the filename (it's prefix.hash.json), so we read each file and let the
		// stored records tell us their original secretName.
		let entries: string[];
		try {
			entries = await readdir(this.baseDir);
		} catch {
			return [];
		}

		const result: SecretKey[] = [];
		for (const entry of entries) {
			if (!entry.endsWith(".json") || entry.endsWith(".tmp")) continue;
			try {
				const data = await readFile(join(this.baseDir, entry));
				const decrypted = this.encryptionKey ? this.decryptFile(data) : data;
				const parsed = JSON.parse(decrypted.toString("utf-8")) as Record<string, SerializedKey>;
				for (const serialized of Object.values(parsed)) {
					result.push(this.deserializeKey(serialized));
				}
			} catch (error) {
				this.logger?.warn("Skipping unreadable key file", {
					file: entry,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		return result;
	}

	// ── File I/O ───────────────────────────────────────────────────────────────

	private async readSecretFile(secretName: string): Promise<Record<string, SerializedKey>> {
		const filePath = this.filePath(secretName);
		try {
			const data = await readFile(filePath);
			const decrypted = this.encryptionKey ? this.decryptFile(data) : data;
			const parsed = JSON.parse(decrypted.toString("utf-8")) as Record<string, SerializedKey>;
			return parsed;
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") {
				return {};
			}
			throw error;
		}
	}

	private async writeSecretFile(
		secretName: string,
		keys: Record<string, SerializedKey>,
	): Promise<void> {
		await mkdir(this.baseDir, { recursive: true, mode: DIR_MODE });
		const filePath = this.filePath(secretName);
		const tempPath = `${filePath}.tmp`;

		const json = Buffer.from(JSON.stringify(keys, null, 2), "utf-8");
		const data = this.encryptionKey ? this.encryptFile(json) : json;

		const uniqueTempPath = `${tempPath}.${Date.now()}.${randomBytes(4).toString("hex")}`;
		await writeFile(uniqueTempPath, data, { mode: FILE_MODE });
		try {
			await rename(uniqueTempPath, filePath);
		} catch (err) {
			try {
				await unlink(uniqueTempPath);
			} catch (cleanupErr) {
				this.logger?.warn("Failed to clean up temp key file", {
					path: uniqueTempPath,
					error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
				});
			}
			throw err;
		}
	}

	private filePath(secretName: string): string {
		// Filenames combine a sanitized prefix (for human readability) with a short hash of
		// the original name. The hash prevents collisions between names that sanitize to the
		// same string (e.g., "foo/bar" and "foo_bar" both becoming "foo_bar.json").
		const safeName = secretName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
		const digest = createHash("sha256").update(secretName).digest("hex").slice(0, 16);
		return join(this.baseDir, `${safeName}.${digest}.json`);
	}

	// ── Serialization ──────────────────────────────────────────────────────────

	private serializeKey(key: SecretKey): SerializedKey {
		const serialized: SerializedKey = {
			keyId: key.keyId,
			secretName: key.secretName,
			encryptedMaterial: key.encryptedMaterial,
			format: key.format,
			validFrom: key.validFrom.toISOString(),
			createdAt: key.createdAt.toISOString(),
			status: key.status,
		};
		if (key.validUntil !== undefined) serialized.validUntil = key.validUntil.toISOString();
		if (key.rotatedAt !== undefined) serialized.rotatedAt = key.rotatedAt.toISOString();
		if (key.revokedAt !== undefined) serialized.revokedAt = key.revokedAt.toISOString();
		if (key.metadata !== undefined) serialized.metadata = key.metadata;
		return serialized;
	}

	private deserializeKey(serialized: SerializedKey): SecretKey {
		const deserialized: SecretKey = {
			keyId: serialized.keyId,
			secretName: serialized.secretName,
			encryptedMaterial: serialized.encryptedMaterial,
			format: serialized.format as SecretKey["format"],
			validFrom: new Date(serialized.validFrom),
			createdAt: new Date(serialized.createdAt),
			status: serialized.status as SecretKey["status"],
		};
		if (serialized.validUntil !== undefined)
			deserialized.validUntil = new Date(serialized.validUntil);
		if (serialized.rotatedAt !== undefined) deserialized.rotatedAt = new Date(serialized.rotatedAt);
		if (serialized.revokedAt !== undefined) deserialized.revokedAt = new Date(serialized.revokedAt);
		if (serialized.metadata !== undefined) deserialized.metadata = serialized.metadata;
		return deserialized;
	}

	// ── Encryption ─────────────────────────────────────────────────────────────

	private encryptFile(plaintext: Buffer): Buffer {
		if (!this.encryptionKey) return plaintext;

		const keyBuffer = Buffer.from(this.encryptionKey, "base64");
		if (keyBuffer.length !== AES_KEY_LENGTH) {
			throw new Error(`Encryption key must be ${AES_KEY_LENGTH} bytes, got ${keyBuffer.length}`);
		}

		const iv = randomBytes(IV_LENGTH);
		const cipher = createCipheriv("aes-256-gcm", keyBuffer, iv);
		const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
		const authTag = cipher.getAuthTag();

		keyBuffer.fill(0);

		// Format: iv + authTag + ciphertext
		return Buffer.concat([iv, authTag, ciphertext]);
	}

	private decryptFile(data: Buffer): Buffer {
		if (!this.encryptionKey) return data;

		const keyBuffer = Buffer.from(this.encryptionKey, "base64");
		if (keyBuffer.length !== AES_KEY_LENGTH) {
			throw new Error(`Encryption key must be ${AES_KEY_LENGTH} bytes, got ${keyBuffer.length}`);
		}

		if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) {
			throw new Error("Encrypted data is too short");
		}

		const iv = data.subarray(0, IV_LENGTH);
		const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
		const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

		const decipher = createDecipheriv("aes-256-gcm", keyBuffer, iv);
		decipher.setAuthTag(authTag);

		const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
		keyBuffer.fill(0);

		return plaintext;
	}
}

/** Serialized form of SecretKey with ISO date strings. */
interface SerializedKey {
	keyId: string;
	secretName: string;
	encryptedMaterial: string;
	format: string;
	validFrom: string;
	validUntil?: string;
	status: string;
	createdAt: string;
	rotatedAt?: string;
	revokedAt?: string;
	metadata?: Record<string, unknown>;
}
