/**
 * Secret Rotation Kit — Zero-downtime multi-key rotation library.
 *
 * @module @reaatech/secret-rotation-kit
 */

// Core types
export type {
	KeyFormat,
	KeyStatus,
	KeyActivatedEvent,
	KeyGeneratedEvent,
	KeyPropagatedEvent,
	KeyRevokedEvent,
	KeyVerifiedEvent,
	ProviderState,
	RotationEvent,
	RotationFailedEvent,
	RotationSession,
	RotationStage,
	RotationState,
	SecretKey,
} from "./types/index.js";

// Verification types
export type {
	Consumer,
	ConsumerAuthConfig,
	ConsumerCapabilities,
	ConsumerVerificationFailure,
	ConsumerVerificationResult,
	RetryPolicy,
	VerificationOptions,
	VerificationResult,
	VerificationStatus,
} from "./types/verification.js";

// Provider types
export type {
	AWSProviderConfig,
	DeleteOptions,
	GCPProviderConfig,
	ProviderCapabilities,
	ProviderConfig,
	ProviderHealth,
	SecretValue,
	SecretVersion,
	VaultProviderConfig,
} from "./types/provider.js";

// Config types
export type {
	EventConfig,
	EventPersistenceConfig,
	EventTransportConfig,
	KeyGenerationConfig,
	KeyWindowConfig as RotationKeyWindowConfig,
	LoggingConfig,
	MetricsConfig,
	ObservabilityConfig,
	RotationConfig,
	SchedulingConfig,
	SidecarConfig,
	TracingConfig,
	VerificationConfig,
} from "./types/config.js";

// Core interfaces
export type {
	ConsumerGroup,
	ConsumerRegistry as ConsumerRegistryInterface,
	EventEmitter,
	EventFilters,
	EventHandler,
	KeyGenerationOptions,
	KeyGenerator,
	KeyStore,
	Logger,
	PropagationVerifier,
	SecretProvider,
} from "./interfaces/index.js";

// Core services
export {
	CryptographicKeyGenerator,
	FileSystemKeyStore,
	InMemoryEventEmitter,
	InMemoryKeyStore,
	KeyLifecycleManager,
	PollingPropagationVerifier,
	ConfigurationError,
	ProviderError,
	PropagationError,
	RotationError,
	RotationManager,
	RotationWorkflow,
	TimeoutError,
	VerificationError,
	assertNodeVersion,
	createRotationConfig,
	generateEncryptionKey,
	isValidEncryptionKey,
	type CreateKeyOptions,
	type FileSystemKeyStoreOptions,
	type InMemoryEventEmitterOptions,
	type RevokeReason,
	type RotationErrorCallback,
	type RotationManagerConfig,
	type RotationRequest,
	type RotationResult,
} from "./core/index.js";

// Resilience
export {
	RetryHandler,
	CircuitBreaker,
	CircuitOpenError,
	KeyWindowManager,
	RollbackManager,
	ConsumerRegistry,
	ActivePropagationVerifier,
	EventStore,
	type ActiveVerifierOptions,
	type CircuitBreakerOptions,
	type CircuitState,
	type ConsumerHealthStatus,
	type ConsumerRegistryOptions,
	type EventStoreOptions,
	type KeyWindowConfig,
	type RetryResult,
	type RollbackEntry,
	type RollbackResult,
} from "./core/index.js";

// Providers
export {
	AWSProvider,
	GCPProvider,
	ProviderFactory,
	VaultProvider,
} from "./providers/index.js";

// Infrastructure
export {
	LoggerService,
	MetricsService,
	ConfigService,
	Counter,
	Gauge,
	Histogram,
	Summary,
	type DeepPartial,
	type LoggerOptions,
	type MetricSnapshot,
} from "./infrastructure/index.js";

// Security
export {
	RateLimiter,
	RateLimitError,
	validateSecretName,
	validateMetadata,
	validateInterval,
	validateCoverage,
	assertValid,
	ValidationError,
	type ValidationResult,
} from "./security/index.js";

// Sidecar
export {
	SidecarServer,
	type SidecarOptions,
} from "./sidecar/index.js";
