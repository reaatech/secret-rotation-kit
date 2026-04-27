import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import type { Logger } from "../interfaces/index.js";
import type { SecretProvider } from "../interfaces/index.js";
import type { RotationSession } from "../types/index.js";
import type {
	DeleteOptions,
	ProviderCapabilities,
	ProviderHealth,
	SecretValue,
	SecretVersion,
	VaultProviderConfig,
} from "../types/provider.js";

// node-vault has loose types, so we define a minimal client interface
interface VaultClient {
	read(path: string): Promise<{
		data: {
			data?: Record<string, unknown>;
			metadata?: {
				version?: number;
				created_time?: string;
				deletion_time?: string;
				destroyed?: boolean;
			};
		};
	}>;
	write(
		path: string,
		data: unknown,
	): Promise<{
		data: {
			created_time?: string;
			version?: number;
		};
	}>;
	delete(path: string): Promise<unknown>;
	list(path: string): Promise<{
		data: {
			keys?: string[];
		};
	}>;
}

/**
 * HashiCorp Vault provider adapter (KV v2).
 *
 * Vault KV v2 supports versioning natively. New writes create new versions
 * automatically. The latest version is always current.
 */
export class VaultProvider implements SecretProvider {
	name = "vault";
	priority = 3;

	private client: VaultClient;
	private mountPath: string;
	private logger: Logger | undefined;

	/**
	 * Static factory that accepts a pre-built Vault client, bypassing the
	 * internal `createRequire` loader. Use this when you already have a
	 * configured `node-vault` instance or when running in environments that
	 * do not support `createRequire`.
	 */
	static create(config: VaultProviderConfig, client: VaultClient): VaultProvider {
		return new VaultProvider(config, client);
	}

	constructor(config: VaultProviderConfig, client?: VaultClient) {
		if (client) {
			this.client = client;
		} else {
			let vaultModule: unknown;
			try {
				const requireFromHere = createRequire(import.meta.url);
				vaultModule = requireFromHere("node-vault");
			} catch (cause) {
				throw new Error(
					'Optional peer dependency "node-vault" is not installed. Install it with:\n  npm install node-vault',
					{ cause },
				);
			}

			const vault =
				typeof (vaultModule as { default?: unknown }).default === "function"
					? (
							vaultModule as {
								default: (opts: {
									apiVersion: string;
									endpoint: string;
									token?: string;
								}) => VaultClient;
							}
						).default
					: (vaultModule as (opts: {
							apiVersion: string;
							endpoint: string;
							token?: string;
						}) => VaultClient);

			const opts: { apiVersion: string; endpoint: string; token?: string } = {
				apiVersion: "v1",
				endpoint: config.url,
			};
			if (config.token) {
				opts.token = config.token;
			} else if (config.roleId && config.secretId) {
				throw new Error(
					"Vault AppRole authentication is not yet supported. Use a static token via config.token instead. Tracked at https://github.com/reaatech/secret-rotation-kit/issues",
				);
			} else {
				throw new Error(
					"Vault provider requires either 'token' or 'roleId' + 'secretId' in configuration.",
				);
			}
			this.client = vault(opts);
		}
		this.mountPath = config.mountPath.replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
		this.logger = config.logger as Logger | undefined;
	}

	async createSecret(name: string, value: string): Promise<void> {
		this.validateName(name);
		await this.client.write(`${this.mountPath}/data/${name}`, {
			data: { value },
		});
	}

	async getSecret(name: string, version?: string): Promise<SecretValue> {
		this.validateName(name);
		const path = version
			? `${this.mountPath}/data/${name}?version=${version}`
			: `${this.mountPath}/data/${name}`;

		const response = await this.client.read(path);
		const secretValue =
			typeof response.data.data?.value === "string" ? response.data.data.value : "";

		return {
			value: secretValue,
			versionId: response.data.metadata?.version?.toString() ?? "",
			createdAt: response.data.metadata?.created_time
				? new Date(response.data.metadata.created_time)
				: new Date(),
			metadata: {
				destroyed: response.data.metadata?.destroyed,
				deletionTime: response.data.metadata?.deletion_time,
			},
		};
	}

	async storeSecretValue(
		name: string,
		value: string,
		_options?: { stage?: "current" | "pending" },
	): Promise<SecretValue> {
		this.validateName(name);
		// In Vault KV v2, every write becomes a new version and the latest is always current.
		// There is no native pending stage; cancelRotation undoes the write if needed.
		const response = await this.client.write(`${this.mountPath}/data/${name}`, {
			data: { value },
		});

		return {
			value,
			versionId: response.data.version?.toString() ?? "",
			createdAt: response.data.created_time ? new Date(response.data.created_time) : new Date(),
		};
	}

	async deleteSecret(name: string, options?: DeleteOptions): Promise<void> {
		this.validateName(name);
		if (options?.permanent) {
			// Permanently delete all versions and metadata
			await this.client.delete(`${this.mountPath}/metadata/${name}`);
		} else {
			// Soft delete (marks latest version as deleted)
			await this.client.delete(`${this.mountPath}/data/${name}`);
		}
	}

	async listVersions(name: string): Promise<SecretVersion[]> {
		this.validateName(name);
		try {
			const response = await this.client.read(`${this.mountPath}/metadata/${name}`);
			const metadata = response.data as Record<string, unknown>;
			const versions = (metadata.versions ?? undefined) as
				| Record<string, { created_time?: string; destroyed?: boolean }>
				| undefined;

			if (!versions) return [];

			return Object.entries(versions).map(([versionId, meta]) => ({
				versionId,
				createdAt: meta.created_time ? new Date(meta.created_time) : new Date(),
				...(meta.destroyed && { stages: ["destroyed"] }),
			}));
		} catch (error) {
			this.logger?.warn("Failed to list Vault versions", {
				secret: name,
				error: error instanceof Error ? error.message : String(error),
			});
			return [];
		}
	}

	async getVersion(name: string, versionId: string): Promise<SecretValue> {
		this.validateName(name);
		return this.getSecret(name, versionId);
	}

	async deleteVersion(name: string, versionId: string): Promise<void> {
		this.validateName(name);
		await this.client.delete(`${this.mountPath}/data/${name}?version=${versionId}`);
	}

	supportsRotation(): boolean {
		return true;
	}

	async beginRotation(name: string): Promise<RotationSession> {
		// Vault KV v2 has no separate "pending" stage; the workflow will write the new
		// value via storeSecretValue and update session.state.versionId from the result.
		return {
			sessionId: this.generateSessionId(),
			secretName: name,
			provider: this.name,
			state: { metadata: { status: "pending" } },
			startedAt: new Date(),
		};
	}

	async completeRotation(_session: RotationSession): Promise<void> {
		// In Vault KV v2, the new version is already active.
		// No explicit stage transition is needed.
	}

	async cancelRotation(session: RotationSession): Promise<void> {
		try {
			if (session.state.versionId) {
				await this.deleteVersion(session.secretName, session.state.versionId);
			}
		} catch (error) {
			this.logger?.warn("Failed to cancel Vault rotation", {
				secretName: session.secretName,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	async health(): Promise<ProviderHealth> {
		try {
			const start = Date.now();
			await this.client.read("sys/health");
			return {
				status: "healthy",
				latency: Date.now() - start,
				lastChecked: new Date(),
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const statusCode = (error as { response?: { statusCode?: number } }).response?.statusCode;
			const sealedCodes = [429, 500, 503];
			const isUnreachable = statusCode !== undefined && !sealedCodes.includes(statusCode);
			return {
				status: isUnreachable ? "unhealthy" : "degraded",
				latency: 0,
				lastChecked: new Date(),
				message,
			};
		}
	}

	capabilities(): ProviderCapabilities {
		return {
			supportsRotation: true,
			supportsVersioning: true,
			supportsLabels: false,
		};
	}

	private validateName(name: string): void {
		if (name.includes("..") || name.includes("/") || name.includes("\\")) {
			throw new Error(`Invalid secret name: "${name}". Names must not contain path separators.`);
		}
	}

	private generateSessionId(): string {
		return `vault-rot-${Date.now().toString(36)}-${randomBytes(16).toString("hex")}`;
	}
}
