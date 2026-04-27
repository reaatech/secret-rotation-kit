import type { RotationConfig } from "../types/config.js";
import type { ProviderConfig } from "../types/provider.js";

export type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

const DEFAULTS_WITHOUT_PROVIDER = {
	keyGeneration: {
		algorithm: "aes-256-gcm",
		keyLength: 256,
		format: "base64" as const,
	},
	scheduling: {
		enabled: false,
		interval: 86_400_000,
	},
	verification: {
		strategy: "active" as const,
		timeout: 30_000,
		minConsumerCoverage: 0.95,
		perConsumerTimeout: 5_000,
		retryPolicy: {
			maxRetries: 3,
			backoffMultiplier: 2,
			initialDelayMs: 1000,
			maxDelayMs: 30_000,
		},
	},
	keyWindows: {
		overlapPeriodMs: 300_000,
		gracePeriodMs: 3_600_000,
	},
	events: {
		enabled: true,
		transports: [],
		persistence: {
			enabled: false,
		},
	},
	sidecar: {
		enabled: false,
		port: 8080,
		enableGRPC: false,
	},
	observability: {
		logging: {
			level: "info" as const,
			structured: true,
		},
		metrics: {
			enabled: true,
			format: "prometheus" as const,
		},
		tracing: {
			enabled: false,
		},
	},
};

/**
 * Builds a full RotationConfig from a minimal provider config and optional overrides.
 *
 * Deep-merges user overrides with sensible defaults so callers only need to
 * specify what deviates from the defaults.
 */
export class ConfigService {
	static create(
		provider: ProviderConfig,
		overrides?: DeepPartial<Omit<RotationConfig, "provider">>,
	): RotationConfig {
		const merged = deepMerge(
			DEFAULTS_WITHOUT_PROVIDER,
			(overrides ?? {}) as Record<string, unknown>,
		);
		return { ...merged, provider } as RotationConfig;
	}

	static defaults(): typeof DEFAULTS_WITHOUT_PROVIDER {
		return JSON.parse(
			JSON.stringify(DEFAULTS_WITHOUT_PROVIDER),
		) as typeof DEFAULTS_WITHOUT_PROVIDER;
	}
}

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function deepMerge(
	target: Record<string, unknown>,
	source: Record<string, unknown>,
): Record<string, unknown> {
	const result = { ...target };
	for (const key of Object.keys(source)) {
		if (BLOCKED_KEYS.has(key)) continue;
		const sv = source[key];
		const tv = result[key];
		if (
			typeof sv === "object" &&
			sv !== null &&
			!Array.isArray(sv) &&
			typeof tv === "object" &&
			tv !== null &&
			!Array.isArray(tv)
		) {
			result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
		} else if (sv !== undefined) {
			result[key] = sv;
		}
	}
	return result;
}
