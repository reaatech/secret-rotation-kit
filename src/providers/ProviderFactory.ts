import { ConfigurationError } from "../core/errors.js";
import type { SecretProvider } from "../interfaces/index.js";
import type {
	AWSProviderConfig,
	GCPProviderConfig,
	ProviderConfig,
	VaultProviderConfig,
} from "../types/provider.js";
import { AWSProvider } from "./AWSProvider.js";
import { GCPProvider } from "./GCPProvider.js";
import { VaultProvider } from "./VaultProvider.js";

/**
 * Creates provider instances from configuration.
 */
export class ProviderFactory {
	/**
	 * Create a provider instance from configuration.
	 *
	 * @param config - Provider configuration.
	 * @returns Configured provider instance.
	 * @throws ConfigurationError if provider type is unknown or required fields are missing.
	 */
	static create(config: ProviderConfig): SecretProvider {
		switch (config.type) {
			case "aws": {
				const awsConfig = config as AWSProviderConfig;
				if (!awsConfig.region) {
					throw new ConfigurationError("AWS provider requires 'region' in configuration");
				}
				return new AWSProvider(awsConfig);
			}

			case "gcp": {
				const gcpConfig = config as GCPProviderConfig;
				if (!gcpConfig.projectId) {
					throw new ConfigurationError("GCP provider requires 'projectId' in configuration");
				}
				return new GCPProvider(gcpConfig);
			}

			case "vault": {
				const vaultConfig = config as VaultProviderConfig;
				if (!vaultConfig.url) {
					throw new ConfigurationError("Vault provider requires 'url' in configuration");
				}
				if (!vaultConfig.mountPath) {
					throw new ConfigurationError("Vault provider requires 'mountPath' in configuration");
				}
				return new VaultProvider(vaultConfig);
			}

			default: {
				throw new ConfigurationError(`Unknown provider type: ${(config as ProviderConfig).type}`);
			}
		}
	}
}
