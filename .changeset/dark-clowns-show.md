---
"@reaatech/secret-rotation-kit": minor
---

Initial MVP release with zero-downtime secret rotation support.

### Added
- `RotationManager` — primary entry point for manual and automatic secret rotation
- `RotationWorkflow` — end-to-end orchestration of generate → propagate → verify → activate → revoke
- `PollingPropagationVerifier` — polls the provider to confirm new secret versions are readable before activation
- `InMemoryEventEmitter` — local event bus for rotation lifecycle events (key_generated, key_propagated, key_verified, key_activated, rotation_failed)
- Structured error hierarchy (`RotationError`, `ProviderError`, `PropagationError`, `VerificationError`, `TimeoutError`) with retry hints
- `createRotationConfig()` helper for ergonomic configuration

### Changed
- Event types now include optional `metadata` fields for richer observability
- `RotationManagerConfig` supports `providerInstance` injection for testing and advanced use cases
- `SecretProvider.storeSecretValue` third argument is now `options?: { stage?: "current" | "pending" }`. The previous `version?: string` argument was unused by every built-in provider; rotation workflows now pass `{ stage: "pending" }` and providers stage the write appropriately (AWSPENDING for AWS, latest+rotation-status label for GCP, new KV v2 version for Vault)
- `beginRotation` no longer pre-creates a placeholder version. The workflow sets `session.state.versionId` from the propagation result so verification and `completeRotation` operate on the actual new version
- `InMemoryEventEmitter` history is now bounded (default 1000 events, configurable via `maxHistory`)
- `FileSystemKeyStore` filenames now include a hash suffix to prevent collisions between names that sanitize to the same string
- `PollingPropagationVerifier.cancelVerification` now actually short-circuits the polling loop and rejects the in-flight `verify()` promptly
- `KeyLifecycleManager.markFailed` is allowed from any non-terminal state (was: pending only) so failures after activation are recorded
- Encryption uses 12-byte IVs for AES-GCM (per NIST SP 800-38D), down from 16

### Fixed
- `VaultProvider` no longer fails under pure-ESM consumers (`Dynamic require not supported`). Loads `node-vault` via `createRequire(import.meta.url)`
