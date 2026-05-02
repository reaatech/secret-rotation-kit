# @reaatech/secret-rotation-core

[![npm version](https://img.shields.io/npm/v/@reaatech/secret-rotation-core.svg)](https://www.npmjs.com/package/@reaatech/secret-rotation-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/secret-rotation-kit/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/secret-rotation-kit/ci.yml?branch=main&label=CI)](https://github.com/reaatech/secret-rotation-kit/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Core rotation engine for [Secret Rotation Kit](https://github.com/reaatech/secret-rotation-kit). Orchestrates the full zero-downtime rotation lifecycle with propagation verification, resilience patterns, and pluggable provider adapters.

## Installation

```bash
npm install @reaatech/secret-rotation-core
# or
pnpm add @reaatech/secret-rotation-core
```

To rotate secrets, you'll also need at least one provider adapter:

```bash
pnpm add @reaatech/secret-rotation-provider-aws
```

## Feature Overview

- **Full rotation lifecycle** — generate → propagate → verify → activate → revoke
- **Overlapping key windows** — old and new keys coexist during rotation (configurable overlap/grace periods)
- **Dual verification strategies** — provider-level polling and consumer-level active verification
- **Resilience patterns** — exponential backoff with jitter, circuit breaker, automatic rollback
- **Key lifecycle management** — state machine: pending → active → expired → revoked/failed
- **Consumer registry** — track consumers with health monitoring and interest groups
- **Key storage backends** — in-memory (test/dev) and persistent file-system with AES-256-GCM encryption
- **Event system** — typed event emitter with in-memory and disk-persisted (JSON-lines) backends
- **Pluggable providers** — swap AWS, GCP, or Vault without changing application code
- **Input validation** — secret name constraints, metadata limits, numeric range checks
- **Rate limiting** — per-secret token-bucket rate limiter to prevent rotation flooding

## Quick Start

```typescript
import { RotationManager } from '@reaatech/secret-rotation-core';
import { AWSProvider } from '@reaatech/secret-rotation-provider-aws';

const provider = new AWSProvider({ region: 'us-east-1' });

const manager = new RotationManager({
  providerInstance: provider,
  rotationIntervalMs: 24 * 60 * 60 * 1000, // 24 hours
});

// Subscribe to events
manager.events.on('key_activated', (event) => {
  console.log(`Key ${event.keyId} active for ${event.secretName}`);
});

// Manual rotation
const result = await manager.rotate('database-password');

// Scheduled rotation
await manager.start(['database-password']);
```

## API Reference

### `RotationManager`

The primary entry point. Wires together provider, key store, verifier, rate limiter, rollback manager, and event emitter.

#### Constructor Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `providerInstance` | `SecretProvider` | (required) | Provider adapter instance |
| `keyStore` | `KeyStore` | `InMemoryKeyStore` | Key storage backend |
| `verifier` | `PropagationVerifier` | `PollingPropagationVerifier` | Propagation verification strategy |
| `eventEmitter` | `EventEmitter` | `InMemoryEventEmitter` | Event bus for lifecycle events |
| `logger` | `Logger` | — | Structured logger |
| `rotationIntervalMs` | `number` | — | Auto-rotation interval (disabled if omitted) |
| `verificationTimeoutMs` | `number` | `30000` | Default verification timeout |
| `minConsumerCoverage` | `number` | `1.0` | Minimum consumer coverage ratio (0–1) |
| `rateLimiter` | `RateLimiter` | `RateLimiter()` | Per-secret rate limiter |
| `validateInputs` | `boolean` | `true` | Enable input validation |
| `rollback` | `object` | `{ enabled: true }` | Rollback manager configuration |

#### Methods

| Method | Description |
|--------|-------------|
| `rotate(secretName, options?)` | Execute a single rotation, returns `RotationResult` |
| `start(secretNames)` | Begin automatic rotation on a fixed interval |
| `stop()` | Stop automatic rotation |
| `getState(secretName)` | Get current `RotationState` for a secret |
| `events` | Access the underlying `EventEmitter` |
| `providerInstance` | Access the underlying `SecretProvider` |
| `limiter` | Access the rate limiter |

### `RotationWorkflow`

The lifecycle orchestrator. Executes a 7-step pipeline and emits events at each stage:

1. Generate key material (`CryptographicKeyGenerator`)
2. Save to key store
3. Begin provider rotation session
4. Store secret value in provider
5. Verify propagation
6. Activate new key (old key → expired)
7. Complete provider session

### `KeyLifecycleManager`

Key state machine:

```
pending → active → expired → revoked
                      ↘ failed
```

| Method | Description |
|--------|-------------|
| `create(options)` | Create a new pending key |
| `activate(secretName, keyId)` | Promote pending → active (old active → expired) |
| `expire(secretName, keyId)` | Force a key to expired |
| `revoke(secretName, keyId, reason)` | Revoke a key (terminal state) |
| `markFailed(secretName, keyId, error)` | Mark as failed (terminal state) |
| `getState(secretName)` | Get `RotationState` summary |

### Verification

#### `PollingPropagationVerifier`

Polls the provider to confirm the new version is readable. Suitable for library-managed secrets.

```typescript
const verifier = new PollingPropagationVerifier(provider);
```

#### `ActivePropagationVerifier`

Reaches out to registered consumers via HTTP to confirm they're serving the new version.

```typescript
const verifier = new ActivePropagationVerifier(provider, consumerRegistry, {
  timeout: 30000,
  minConsumerCoverage: 1.0,
});
```

### Resilience

| Export | Description |
|--------|-------------|
| `RetryHandler` | Exponential backoff with full jitter: `maxRetries`, `backoffMultiplier`, `initialDelayMs`, `maxDelayMs` |
| `CircuitBreaker` | Fault tolerance: closed → open → half-open. Configurable failure/success thresholds and reset timeout |
| `RollbackManager` | Automatic rollback: cancels provider session, marks key as failed, reactivates previous key |
| `KeyWindowManager` | Overlap management: old and new keys valid simultaneously for `overlapPeriodMs` |
| `RateLimiter` | Per-secret token-bucket rate limiter: configurable burst and window |

### Key Storage

| Export | Description |
|--------|-------------|
| `InMemoryKeyStore` | Thread-safe `Map`-backed store with per-key locking |
| `FileSystemKeyStore` | One JSON file per secret, atomic writes, optional AES-256-GCM encryption |

### Key Generation

| Export | Description |
|--------|-------------|
| `CryptographicKeyGenerator` | `crypto.randomBytes`-based generation. Supports `base64`, `hex`, `pem`, `raw` formats. AES-256-GCM encrypt/decrypt. Buffers zeroed after use. |

### Events

| Event Type | When |
|------------|------|
| `key_generated` | New cryptographic key material created |
| `key_propagated` | Key stored in the provider |
| `key_verified` | Propagation confirmed by verifier |
| `key_activated` | New key promoted to active (previous → expired) |
| `key_revoked` | Old key revoked |
| `rotation_failed` | Rotation failed with stage and retry hint |

## Related Packages

- [`@reaatech/secret-rotation-types`](https://www.npmjs.com/package/@reaatech/secret-rotation-types) — Shared types and interfaces
- [`@reaatech/secret-rotation-observability`](https://www.npmjs.com/package/@reaatech/secret-rotation-observability) — Logging and metrics
- [`@reaatech/secret-rotation-provider-aws`](https://www.npmjs.com/package/@reaatech/secret-rotation-provider-aws) — AWS adapter
- [`@reaatech/secret-rotation-provider-gcp`](https://www.npmjs.com/package/@reaatech/secret-rotation-provider-gcp) — GCP adapter
- [`@reaatech/secret-rotation-provider-vault`](https://www.npmjs.com/package/@reaatech/secret-rotation-provider-vault) — Vault adapter
- [`@reaatech/secret-rotation-sidecar`](https://www.npmjs.com/package/@reaatech/secret-rotation-sidecar) — HTTP sidecar

## License

[MIT](https://github.com/reaatech/secret-rotation-kit/blob/main/LICENSE)
