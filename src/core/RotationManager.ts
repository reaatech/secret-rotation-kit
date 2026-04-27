import type {
	EventEmitter,
	KeyStore,
	Logger,
	PropagationVerifier,
	SecretProvider,
} from "../interfaces/index.js";
import { ProviderFactory } from "../providers/ProviderFactory.js";
import { assertValid, validateSecretName } from "../security/InputValidator.js";
import { RateLimiter } from "../security/RateLimiter.js";
import type { RotationState } from "../types/index.js";
import type { ProviderConfig } from "../types/provider.js";
import { CryptographicKeyGenerator } from "./CryptographicKeyGenerator.js";
import { InMemoryEventEmitter } from "./InMemoryEventEmitter.js";
import { InMemoryKeyStore } from "./InMemoryKeyStore.js";
import { KeyLifecycleManager } from "./KeyLifecycleManager.js";
import { PollingPropagationVerifier } from "./PollingPropagationVerifier.js";
import { RollbackManager } from "./RollbackManager.js";
import { type RotationRequest, type RotationResult, RotationWorkflow } from "./RotationWorkflow.js";
import { RotationError } from "./errors.js";

/** Called when automatic rotation fails for a single secret. */
export type RotationErrorCallback = (secretName: string, error: Error) => void | Promise<void>;

/** Simplified configuration for RotationManager. */
export interface RotationManagerConfig {
	/** Provider configuration. */
	provider?: ProviderConfig;

	/** Pre-built provider instance (takes precedence over provider config). */
	providerInstance?: SecretProvider;

	/** Key store (defaults to InMemoryKeyStore). */
	keyStore?: KeyStore;

	/** Custom propagation verifier (defaults to PollingPropagationVerifier). */
	verifier?: PropagationVerifier;

	/** Custom event emitter (defaults to InMemoryEventEmitter). */
	eventEmitter?: EventEmitter;

	/** Optional logger. */
	logger?: Logger;

	/** Automatic rotation interval in milliseconds (disabled if omitted). */
	rotationIntervalMs?: number;

	/** Default verification timeout in milliseconds. */
	verificationTimeoutMs?: number;

	/** Default minimum consumer coverage (0–1). */
	minConsumerCoverage?: number;

	/** Rate limiter instance (defaults to a built-in rate limiter). */
	rateLimiter?: RateLimiter;

	/** Enable input validation on secret names (default true). */
	validateInputs?: boolean;

	/** Callback invoked when automatic rotation fails for a single secret. */
	onRotationError?: RotationErrorCallback;

	/** Configuration for the built-in RollbackManager. Omit to disable. */
	rollback?: {
		enabled?: boolean;
		maxEntries?: number;
	};
}

/**
 * Primary entry point for secret rotation.
 *
 * Wires together the provider, key generator, key store, verifier, rate limiter,
 * and event emitter into a single ergonomic API.
 *
 * ```typescript
 * const manager = new RotationManager({
 *   provider: { type: 'aws', region: 'us-east-1' }
 * });
 *
 * // Manual rotation
 * const result = await manager.rotate('database-password');
 *
 * // Automatic rotation every 24 hours
 * const auto = new RotationManager({
 *   provider: { type: 'aws', region: 'us-east-1' },
 *   rotationIntervalMs: 24 * 60 * 60 * 1000
 * });
 * await auto.start();
 * ```
 */
export class RotationManager {
	private readonly provider: SecretProvider;
	private readonly keyStore: KeyStore;
	private readonly verifier: PropagationVerifier;
	private readonly eventEmitter: EventEmitter;
	private readonly logger: Logger | undefined;
	private readonly workflow: RotationWorkflow;
	private readonly lifecycle: KeyLifecycleManager;
	private readonly config: RotationManagerConfig;
	private readonly rateLimiter: RateLimiter;
	private readonly validateInputs: boolean;
	private readonly rollbackManager: RollbackManager | undefined;

	private scheduleTimer: ReturnType<typeof setTimeout> | null = null;
	private scheduleActive = false;
	private rotatingSecrets: Set<string> = new Set();

	constructor(config: RotationManagerConfig) {
		this.config = config;
		if (config.providerInstance) {
			this.provider = config.providerInstance;
		} else if (config.provider) {
			this.provider = ProviderFactory.create(config.provider);
		} else {
			throw new Error("Either provider or providerInstance must be provided");
		}
		this.keyStore = config.keyStore ?? new InMemoryKeyStore();
		this.verifier = config.verifier ?? new PollingPropagationVerifier(this.provider);
		this.eventEmitter = config.eventEmitter ?? new InMemoryEventEmitter();
		this.logger = config.logger;
		this.rateLimiter = config.rateLimiter ?? new RateLimiter();
		this.validateInputs = config.validateInputs ?? true;

		const rollbackEnabled = config.rollback?.enabled ?? true;
		this.rollbackManager = rollbackEnabled
			? new RollbackManager(
					this.provider,
					this.keyStore,
					this.eventEmitter,
					this.logger ?? undefined,
					config.rollback?.maxEntries,
				)
			: undefined;

		const keyGenerator = new CryptographicKeyGenerator();
		this.workflow = new RotationWorkflow(
			keyGenerator,
			this.provider,
			this.keyStore,
			this.verifier,
			this.eventEmitter,
			this.logger ?? undefined,
			this.rollbackManager,
		);
		this.lifecycle = new KeyLifecycleManager(this.keyStore, this.logger);
	}

	/**
	 * Rotate a single secret.
	 *
	 * @param secretName - Secret to rotate.
	 * @param options - Optional overrides for this rotation.
	 * @returns Rotation result.
	 */
	async rotate(secretName: string, options?: Partial<RotationRequest>): Promise<RotationResult> {
		if (this.validateInputs) {
			assertValid(validateSecretName(secretName), "secretName");
		}

		if (this.rotatingSecrets.has(secretName) && !options?.force) {
			throw new RotationError(
				`Rotation already in progress for secret: ${secretName}`,
				"generation",
				true,
			);
		}

		try {
			this.rateLimiter.consume(secretName);
		} catch (error) {
			if (error instanceof RotationError) throw error;
			throw new RotationError(
				error instanceof Error ? error.message : `Rate limited: ${secretName}`,
				"generation",
				true,
			);
		}

		this.rotatingSecrets.add(secretName);
		try {
			return await this.workflow.execute({
				secretName,
				verificationTimeout: this.config.verificationTimeoutMs ?? 30000,
				minConsumerCoverage: this.config.minConsumerCoverage ?? 1.0,
				...options,
			});
		} finally {
			this.rotatingSecrets.delete(secretName);
		}
	}

	/**
	 * Start automatic rotation on a fixed interval.
	 *
	 * Uses a drift-corrected setTimeout loop so the interval between
	 * successive rotations stays consistent even if individual rotations
	 * take varying amounts of time. The timer is unref'd by default so
	 * it does not keep the process alive.
	 *
	 * @param secretNames - Secrets to rotate automatically.
	 */
	async start(secretNames: string[]): Promise<void> {
		if (secretNames.length === 0) {
			throw new Error("At least one secret name must be provided");
		}
		if (!this.config.rotationIntervalMs || this.config.rotationIntervalMs <= 0) {
			throw new Error("rotationIntervalMs must be set to start automatic rotation");
		}
		if (this.scheduleActive) {
			throw new Error("Automatic rotation already started");
		}

		if (this.validateInputs) {
			for (const name of secretNames) {
				assertValid(validateSecretName(name), `secretName "${name}"`);
			}
		}

		this.logger?.info("Starting automatic rotation", {
			secrets: secretNames,
			intervalMs: this.config.rotationIntervalMs,
		});

		this.scheduleActive = true;
		this.scheduleLoop(secretNames, this.config.rotationIntervalMs);
	}

	/**
	 * Stop automatic rotation.
	 */
	async stop(): Promise<void> {
		this.scheduleActive = false;
		if (this.scheduleTimer) {
			clearTimeout(this.scheduleTimer);
			this.scheduleTimer = null;
		}
		this.logger?.info("Automatic rotation stopped");
	}

	/**
	 * Get the current rotation state for a secret.
	 */
	async getState(secretName: string): Promise<RotationState> {
		if (this.validateInputs) {
			assertValid(validateSecretName(secretName), "secretName");
		}
		return this.lifecycle.getState(secretName);
	}

	/**
	 * Access the underlying event emitter to subscribe to rotation events.
	 */
	get events(): EventEmitter {
		return this.eventEmitter;
	}

	/**
	 * Access the underlying provider for direct operations.
	 */
	get providerInstance(): SecretProvider {
		return this.provider;
	}

	/**
	 * Access the rate limiter for inspection or manual resets.
	 */
	get limiter(): RateLimiter {
		return this.rateLimiter;
	}

	private async scheduleLoop(secretNames: string[], intervalMs: number): Promise<void> {
		const deadline = Date.now() + intervalMs;
		let shouldReschedule = true;

		try {
			for (const secretName of secretNames) {
				if (!this.scheduleActive) {
					shouldReschedule = false;
					break;
				}
				try {
					await this.rotate(secretName);
				} catch (error) {
					const err = error instanceof Error ? error : new Error(String(error));
					this.logger?.error("Automatic rotation failed", {
						secretName,
						error: err.message,
					});
					try {
						await this.config.onRotationError?.(secretName, err);
					} catch {
						// Callback errors must not break the scheduler loop.
					}
				}
			}
		} catch {
			shouldReschedule = false;
		}

		if (!shouldReschedule) return;

		const drift = Math.max(0, deadline - Date.now());
		this.scheduleTimer = setTimeout(() => {
			this.scheduleLoop(secretNames, intervalMs).catch((err) => {
				this.logger?.error("Scheduler loop crashed", {
					error: err instanceof Error ? err.message : String(err),
				});
			});
		}, drift);
		if (this.scheduleTimer.unref) {
			this.scheduleTimer.unref();
		}
	}
}

/**
 * Create a RotationManager configuration with sensible defaults.
 *
 * @param config - Required provider config plus optional overrides.
 * @returns Ready-to-use RotationManagerConfig.
 */
export function createRotationConfig(
	config: { provider: ProviderConfig } & Partial<Omit<RotationManagerConfig, "provider">>,
): RotationManagerConfig {
	return {
		verificationTimeoutMs: 30000,
		minConsumerCoverage: 1.0,
		...config,
		provider: config.provider,
	};
}
