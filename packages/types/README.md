# @reaatech/secret-rotation-types

[![npm version](https://img.shields.io/npm/v/@reaatech/secret-rotation-types.svg)](https://www.npmjs.com/package/@reaatech/secret-rotation-types)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/secret-rotation-kit/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/secret-rotation-kit/ci.yml?branch=main&label=CI)](https://github.com/reaatech/secret-rotation-kit/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Type definitions, abstract interfaces, and error classes for [Secret Rotation Kit](https://github.com/reaatech/secret-rotation-kit). This package is the single source of truth for all shared types used throughout the `@reaatech/secret-rotation-*` ecosystem.

## Installation

```bash
npm install @reaatech/secret-rotation-types
# or
pnpm add @reaatech/secret-rotation-types
```

## Feature Overview

- **Core types** — `SecretKey`, `KeyStatus`, `RotationState`, `RotationEvent`, and all event payloads
- **Verification types** — `Consumer`, `VerificationResult`, `RetryPolicy`, `VerificationOptions`
- **Config types** — `RotationConfig`, `SchedulingConfig`, `VerificationConfig`, `KeyWindowConfig`
- **Provider types** — `ProviderConfig`, `AWSProviderConfig`, `GCPProviderConfig`, `VaultProviderConfig`
- **Abstract interfaces** — `SecretProvider`, `KeyStore`, `KeyGenerator`, `Logger`, `EventEmitter`, `PropagationVerifier`, `ConsumerRegistry`
- **Error hierarchy** — `RotationError`, `ProviderError`, `PropagationError`, `VerificationError`, `TimeoutError`, `ConfigurationError`
- **Provider registry** — `registerProvider`, `createProvider`, `getRegisteredTypes` for dynamic provider selection
- **Zero runtime dependencies** — pure type definitions, lightweight and tree-shakeable

## Quick Start

```typescript
import type {
  SecretKey,
  KeyStatus,
  SecretProvider,
  RotationConfig,
} from '@reaatech/secret-rotation-types';
```

## Exports

### Core Types

| Export | Description |
|--------|-------------|
| `KeyStatus` | String union: `"pending"`, `"active"`, `"expired"`, `"revoked"`, `"failed"` |
| `KeyFormat` | Encoding format: `"base64"`, `"hex"`, `"pem"`, `"raw"` |
| `RotationStage` | Workflow stage: `"generation"`, `"propagation"`, `"verification"`, `"activation"`, `"revocation"` |
| `SecretKey` | Full key object: `keyId`, `secretName`, `encryptedMaterial`, `format`, `validFrom`, `validUntil`, `status`, timestamps, metadata |
| `ProviderState` | Provider-specific version identifier states |
| `RotationState` | Complete rotation snapshot per secret: active/pending/expired/revoked/failed keys |
| `RotationSession` | In-progress provider rotation session |

### Events

| Export | Description |
|--------|-------------|
| `RotationEvent` | Discriminated union of all event types |
| `KeyGeneratedEvent` | Emitted when new key material is created |
| `KeyPropagatedEvent` | Emitted when key is stored in the provider |
| `KeyVerifiedEvent` | Emitted when propagation is confirmed |
| `KeyActivatedEvent` | Emitted when new key becomes active |
| `KeyRevokedEvent` | Emitted when old key is revoked |
| `RotationFailedEvent` | Emitted on rotation failure with retry info |

### Verification Types

| Export | Description |
|--------|-------------|
| `Consumer` | Registered consumer with endpoint, capabilities, and auth config |
| `ConsumerCapabilities` | `supportsVersionCheck`, `supportsHealthCheck`, `supportsCallback` |
| `ConsumerAuthConfig` | Auth type: `"bearer"`, `"mtls"`, `"api-key"` |
| `VerificationResult` | Aggregated verification result with coverage ratio |
| `ConsumerVerificationResult` | Per-consumer result with version and error info |
| `VerificationOptions` | Timeout, coverage threshold, retry policy |
| `VerificationStatus` | In-flight verification progress |
| `RetryPolicy` | `maxRetries`, `backoffMultiplier`, `initialDelayMs`, `maxDelayMs` |

### Config Types

| Export | Description |
|--------|-------------|
| `RotationConfig` | Top-level configuration assembling all sub-configs |
| `KeyGenerationConfig` | Algorithm, key length, format |
| `SchedulingConfig` | Interval or cron-based rotation scheduling |
| `VerificationConfig` | Strategy (`"active"`, `"passive"`, `"hybrid"`), timeout, coverage |
| `KeyWindowConfig` | Overlap period, grace period, max valid keys |
| `ObservabilityConfig` | Logging, metrics, and tracing settings |
| `SidecarConfig` | HTTP server port and gRPC toggle |

### Error Classes

All errors extend `RotationError` which carries the rotation stage and retry hint:

| Class | Base | Description |
|-------|------|-------------|
| `RotationError` | `Error` | Base class: `stage?: string`, `canRetry: boolean` |
| `ProviderError` | `RotationError` | Provider-level failure with provider name |
| `PropagationError` | `RotationError` | Secret not reaching consumers (retryable) |
| `VerificationError` | `RotationError` | Consumers not using new key (retryable) |
| `TimeoutError` | `RotationError` | Operation exceeded deadline (retryable) |
| `ConfigurationError` | `Error` | Invalid configuration — not retryable |

### Interfaces

| Export | Description |
|--------|-------------|
| `SecretProvider` | Provider adapter contract: CRUD, versions, rotation sessions, health |
| `KeyStore` | Key storage contract: save, get, update, delete, list |
| `KeyGenerator` | Key generation contract: generate, validate, encrypt, decrypt |
| `PropagationVerifier` | Verification contract: verify, getStatus, cancel |
| `EventEmitter` | Event bus contract: emit, on, off, replay |
| `Logger` | Structured logging interface: debug, info, warn, error |
| `ConsumerRegistry` | Consumer tracking contract: register, deregister, query |

## Related Packages

- [`@reaatech/secret-rotation-core`](https://www.npmjs.com/package/@reaatech/secret-rotation-core) — Rotation engine
- [`@reaatech/secret-rotation-provider-aws`](https://www.npmjs.com/package/@reaatech/secret-rotation-provider-aws) — AWS adapter
- [`@reaatech/secret-rotation-provider-gcp`](https://www.npmjs.com/package/@reaatech/secret-rotation-provider-gcp) — GCP adapter
- [`@reaatech/secret-rotation-provider-vault`](https://www.npmjs.com/package/@reaatech/secret-rotation-provider-vault) — Vault adapter

## License

[MIT](https://github.com/reaatech/secret-rotation-kit/blob/main/LICENSE)
