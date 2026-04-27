# Changelog

## [0.1.0] - 2026-04-27

### Added

- **RotationManager**: Primary entry point for manual and scheduled secret rotation.
- **RotationWorkflow**: Orchestrates the full rotation lifecycle (generate -> propagate -> verify -> activate -> revoke).
- **AWSProvider**: AWS Secrets Manager adapter with version stage management (AWSCURRENT/AWSPENDING/AWSPREVIOUS).
- **GCPProvider**: GCP Secret Manager adapter with label-based rotation tracking.
- **VaultProvider**: HashiCorp Vault KV v2 provider adapter.
- **ProviderFactory**: Create providers from declarative configuration.
- **PollingPropagationVerifier**: Verify propagation by polling the provider until the new version is readable.
- **ActivePropagationVerifier**: Verify propagation by reaching out to registered consumer endpoints and confirming their active version.
- **KeyLifecycleManager**: State machine managing key transitions (pending -> active -> expired -> revoked/failed).
- **RollbackManager**: Automatic rollback of failed rotations with previous key reactivation.
- **KeyWindowManager**: Overlapping key validity windows for zero-downtime rotation.
- **ConsumerRegistry**: Track registered consumers, health status, and interest groups.
- **Key Stores**: InMemoryKeyStore (thread-safe) and FileSystemKeyStore (persistent with AES-256-GCM encryption, atomic writes).
- **Event System**: InMemoryEventEmitter and EventStore (memory-buffered with daily JSON-lines persistence).
- **CryptographicKeyGenerator**: Secure key generation with base64/hex/pem/raw formats and AES-256-GCM encryption at rest.
- **RetryHandler**: Exponential backoff with full jitter for transient failures.
- **CircuitBreaker**: Closed -> open -> half-open state machine for fault tolerance.
- **RateLimiter**: Token bucket per-secret rate limiting.
- **InputValidator**: Validation for secret names, metadata, intervals, and coverage ratios.
- **LoggerService**: Structured JSON logger with level filtering and child loggers.
- **MetricsService**: Prometheus-format metrics with Counter, Gauge, Histogram, and Summary types.
- **ConfigService**: Deep-merge configuration with sensible defaults and prototype pollution protection.
- **SidecarServer**: HTTP sidecar with /rotate, /secrets/:name, /health, /metrics, and /events (SSE) endpoints.
- **Error hierarchy**: RotationError, ProviderError, PropagationError, VerificationError, TimeoutError, ConfigurationError, ValidationError, RateLimitError, CircuitOpenError.
- **Dual ESM/CJS build** via tsup with full TypeScript declarations.
- **Zero external dependencies** — provider SDKs are optional peer dependencies.
