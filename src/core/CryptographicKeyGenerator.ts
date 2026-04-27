import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { KeyGenerationOptions, KeyGenerator } from "../interfaces/index.js";
import type { KeyFormat, SecretKey } from "../types/index.js";

/** Default key length in bits. */
const DEFAULT_KEY_LENGTH_BITS = 256;

/** AES-GCM IV length in bytes. NIST SP 800-38D recommends 12 bytes for AES-GCM. */
const IV_LENGTH = 12;

/** AES-256-GCM auth tag length in bytes. */
const AUTH_TAG_LENGTH = 16;

/** AES-256-GCM key length in bytes. */
const AES_KEY_LENGTH = 32;

/**
 * Generates cryptographically secure secret keys using Node.js built-in crypto.
 *
 * Supports multiple output formats and AES-256-GCM encryption at rest.
 */
export class CryptographicKeyGenerator implements KeyGenerator {
	private readonly keyLengthBits: number;

	constructor(keyLengthBits = DEFAULT_KEY_LENGTH_BITS) {
		this.keyLengthBits = keyLengthBits;
	}

	async generate(options: KeyGenerationOptions): Promise<SecretKey> {
		const keyLengthBytes = Math.ceil(this.keyLengthBits / 8);
		const keyMaterial = randomBytes(keyLengthBytes);
		const format = options.format ?? "base64";
		const formattedMaterial = this.formatKey(keyMaterial, format);

		// Zero the raw buffer after formatting
		keyMaterial.fill(0);

		const now = new Date();

		return {
			keyId: this.generateKeyId(),
			secretName: options.secretName,
			encryptedMaterial: formattedMaterial,
			format,
			validFrom: now,
			status: "pending",
			createdAt: now,
			...(options.metadata !== undefined && { metadata: options.metadata }),
		};
	}

	validate(key: SecretKey): boolean {
		if (!key.keyId || key.keyId.length === 0) return false;
		if (!key.secretName || key.secretName.length === 0) return false;
		if (!key.encryptedMaterial || key.encryptedMaterial.length === 0) return false;
		if (!["base64", "hex", "pem", "raw"].includes(key.format)) return false;
		if (!(key.createdAt instanceof Date)) return false;
		if (key.validUntil && key.validUntil <= key.validFrom) return false;
		return true;
	}

	async encrypt(key: SecretKey, encryptionKey: string): Promise<SecretKey> {
		const keyBuffer = Buffer.from(encryptionKey, "base64");
		if (keyBuffer.length !== AES_KEY_LENGTH) {
			throw new Error(
				`Encryption key must be ${AES_KEY_LENGTH} bytes when base64-decoded, got ${keyBuffer.length}`,
			);
		}

		const iv = randomBytes(IV_LENGTH);
		const cipher = createCipheriv("aes-256-gcm", keyBuffer, iv);

		const plaintext = Buffer.from(key.encryptedMaterial, "utf-8");
		const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
		const authTag = cipher.getAuthTag();

		// Securely clear the plaintext buffer
		plaintext.fill(0);
		keyBuffer.fill(0);

		// Format: iv:ciphertext:authTag (all base64)
		const encrypted = `${iv.toString("base64")}:${ciphertext.toString("base64")}:${authTag.toString("base64")}`;

		return {
			...key,
			encryptedMaterial: encrypted,
		};
	}

	async decrypt(key: SecretKey, encryptionKey: string): Promise<SecretKey> {
		const keyBuffer = Buffer.from(encryptionKey, "base64");
		if (keyBuffer.length !== AES_KEY_LENGTH) {
			throw new Error(
				`Encryption key must be ${AES_KEY_LENGTH} bytes when base64-decoded, got ${keyBuffer.length}`,
			);
		}

		const parts = key.encryptedMaterial.split(":");
		if (parts.length !== 3) {
			throw new Error("Invalid encrypted material format: expected 3 parts separated by ':'");
		}

		const [ivPart, ciphertextPart, authTagPart] = parts as [string, string, string];

		const iv = Buffer.from(ivPart, "base64");
		const ciphertext = Buffer.from(ciphertextPart, "base64");
		const authTag = Buffer.from(authTagPart, "base64");

		if (iv.length !== IV_LENGTH) {
			throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
		}
		if (authTag.length !== AUTH_TAG_LENGTH) {
			throw new Error(
				`Invalid auth tag length: expected ${AUTH_TAG_LENGTH}, got ${authTag.length}`,
			);
		}

		const decipher = createDecipheriv("aes-256-gcm", keyBuffer, iv);
		decipher.setAuthTag(authTag);

		const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
		const decryptedMaterial = plaintext.toString("utf-8");

		// Securely clear buffers
		plaintext.fill(0);
		keyBuffer.fill(0);

		return {
			...key,
			encryptedMaterial: decryptedMaterial,
		};
	}

	private formatKey(keyMaterial: Buffer, format: KeyFormat): string {
		switch (format) {
			case "base64":
				return keyMaterial.toString("base64");
			case "hex":
				return keyMaterial.toString("hex");
			case "pem":
				return this.toPEM(keyMaterial);
			case "raw":
				return keyMaterial.toString("utf-8");
			default:
				throw new Error(`Unsupported key format: ${format}`);
		}
	}

	private toPEM(keyMaterial: Buffer): string {
		const base64 = keyMaterial.toString("base64");
		const lines = base64.match(/.{1,64}/g) ?? [base64];
		return `-----BEGIN SECRET KEY-----\n${lines.join("\n")}\n-----END SECRET KEY-----`;
	}

	private generateKeyId(): string {
		const timestamp = Date.now().toString(36);
		const random = randomBytes(8).toString("hex");
		return `${timestamp}-${random}`;
	}
}

/**
 * Validates that a base64-encoded encryption key is suitable for AES-256-GCM.
 *
 * @param encryptionKey - Base64-encoded 32-byte key.
 * @returns True if valid.
 */
export function isValidEncryptionKey(encryptionKey: string): boolean {
	const buf = Buffer.from(encryptionKey, "base64");
	const valid = buf.length === AES_KEY_LENGTH;
	buf.fill(0);
	return valid;
}

/**
 * Generates a new AES-256-GCM encryption key and returns it as a base64-encoded string.
 *
 * @returns Base64-encoded 32-byte key.
 */
export function generateEncryptionKey(): string {
	const key = randomBytes(AES_KEY_LENGTH);
	const encoded = key.toString("base64");
	key.fill(0);
	return encoded;
}
