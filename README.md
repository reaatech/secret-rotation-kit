# Secret Rotation Kit

> Zero-downtime multi-key rotation library for production services.

[![npm version](https://img.shields.io/npm/v/secret-rotation-kit?color=blue)](https://www.npmjs.com/package/secret-rotation-kit)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933)](./package.json)
[![TypeScript](https://img.shields.io/badge/typescript-%5E5.8-3178C6)](./package.json)

---

## Overview

Rotating secrets in production is one of the hardest operational problems to get right. If you revoke the old key before every consumer has picked up the new one, you cause an outage. Most teams either accept downtime during rotation windows or build fragile, one-off solutions.

Secret Rotation Kit is a battle-tested, zero-dependency library that solves this. It orchestrates the full rotation lifecycle across AWS Secrets Manager, GCP Secret Manager, and HashiCorp Vault, with overlapping key windows, propagation verification, automatic rollback, and comprehensive observability.

### The Hard Part: Propagation Verification

Creating a new secret version is the easy part. **Knowing when every consumer is actually using it** is where most implementations fail. This library provides two complementary strategies:

- **Polling verification** — polls the provider directly to confirm the new version is readable and being served.
- **Active verification** — reaches out to each registered consumer and confirms their active version matches the newly rotated key.

You can combine both strategies to achieve the coverage guarantees your service needs before the old key is revoked.

---

## Features

**Core**
- Zero-downtime rotation with overlapping key validity windows
- Full rotation lifecycle: generate → propagate → verify → activate → revoke
- Manual and interval-based scheduled rotation
- Cryptographically secure key generation (AES-256-GCM encryption at rest)

**Providers**
- AWS Secrets Manager (version stage management: `AWSCURRENT`/`AWSPENDING`/`AWSPREVIOUS`)
- GCP Secret Manager (label-based rotation tracking)
- HashiCorp Vault (KV v2, token-based auth)
- ProviderFactory for declarative provider selection

**Verification**
- Polling-based provider propagation verification
- Active consumer-level verification (HTTP health/version checks)
- Configurable timeouts and coverage ratios

**Resilience**
- Retry with exponential backoff and full jitter
- Circuit breaker (closed → open → half-open)
- Automatic rollback of failed rotations
- Per-secret rate limiting (token bucket)

**State Management**
- Full key state machine (pending → active → expired → revoked/failed)
- Consumer registry with health tracking and interest groups
- Persistent event store (daily JSON-lines log files)

**Observability**
- Structured JSON logging with level filtering
- Prometheus-format metrics (Counter, Gauge, Histogram, Summary)
- SSE event streaming via sidecar

**Interface**
- HTTP sidecar server (`POST /rotate`, `GET /secrets/:name`, `GET /health`, `GET /metrics`, `GET /events`)
- Typed event emitter with history replay
- CORS support and optional bearer token auth

**Safety**
- Input validation (secret names, metadata, intervals, coverage ratios)
- Buffer hygiene (zeroed after use)
- Atomic file writes (temp file + rename) for persistent stores
- Prototype pollution protection in config merging

---

## Installation

```bash
npm install secret-rotation-kit
# or
pnpm add secret-rotation-kit
```

Provider SDKs are optional peer dependencies. Install only what you need:

```bash
# AWS Secrets Manager
pnpm add @aws-sdk/client-secrets-manager

# GCP Secret Manager
pnpm add @google-cloud/secret-manager

# HashiCorp Vault
pnpm add node-vault
```

The library has **zero runtime dependencies** outside of the provider SDKs you choose to install.

## Requirements

| Dependency | Version |
|------------|---------|
| Node.js    | >= 20.0 |
| TypeScript | ^5.8   |

---

## Quick Start

```typescript
import { RotationManager, createRotationConfig } from "secret-rotation-kit";

const config = createRotationConfig({
  provider: {
    type: "aws",
    region: "us-east-1",
  },
  scheduling: {
    rotationIntervalMs: 24 * 60 * 60 * 1000, // 24 hours
  },
  verification: {
    timeoutMs: 30_000,
    minConsumerCoverage: 1.0,
  },
});

const manager = new RotationManager(config);

// Subscribe to lifecycle events
manager.events.on("key_activated", (event) => {
  console.log(`New key active for ${event.secretName}`);
});

manager.events.on("rotation_failed", (event) => {
  console.error(`Rotation failed for ${event.secretName}: ${event.error.message}`);
});

// Trigger a manual rotation
const result = await manager.rotate("database-password");
console.log(`Rotated in ${result.duration}ms`);

// Or start automatic rotation
await manager.start(["database-password", "api-key"]);
// ... later
await manager.stop();
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Application Layer                        │
│   RotationManager · ConsumerRegistry · SidecarServer       │
├──────────────────────────────────────────────────────────┤
│                   Core Services Layer                      │
│   RotationWorkflow · PollingPropagationVerifier            │
│   ActivePropagationVerifier · KeyLifecycleManager          │
│   KeyWindowManager · InMemoryEventEmitter                  │
├──────────────────────────────────────────────────────────┤
│                   Resilience Layer                         │
│   RetryHandler · CircuitBreaker · RollbackManager          │
│   EventStore · RateLimiter · InputValidator                │
├──────────────────────────────────────────────────────────┤
│                   Provider Layer                           │
│   AWSProvider · GCPProvider · VaultProvider                │
│   ProviderFactory                                          │
├──────────────────────────────────────────────────────────┤
│                   Infrastructure Layer                     │
│   KeyGenerator · KeyStore (InMemory / FileSystem)          │
│   LoggerService · MetricsService · ConfigService           │
└──────────────────────────────────────────────────────────┘
```

For a detailed walkthrough of every component and the complete type system, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Configuration

```typescript
import { RotationManager } from "secret-rotation-kit";

const manager = new RotationManager({
  // --- Provider (required) ---
  provider: {
    type: "aws",                // "aws" | "gcp" | "vault"
    region: "us-east-1",
    // endpoint: "http://localhost:4566",  // optional custom endpoint
  },

  // --- Key store (defaults to InMemoryKeyStore) ---
  keyStore: new FileSystemKeyStore({
    baseDir: "./secrets",
    encryptionKey: process.env.SRK_ENCRYPTION_KEY,  // optional AES-256-GCM
  }),

  // --- Key generation ---
  keyGenerator: new CryptographicKeyGenerator({
    format: "base64",
    length: 32,
    encryptionKey: process.env.SRK_ENCRYPTION_KEY,
  }),

  // --- Verification ---
  verifier: new ActivePropagationVerifier({
    provider: myProvider,
    consumerRegistry: myRegistry,
    retryHandler: new RetryHandler({ maxRetries: 5 }),
  }),
  verificationTimeoutMs: 30_000,
  minConsumerCoverage: 1.0,

  // --- Scheduling ---
  rotationIntervalMs: 24 * 60 * 60 * 1000,

  // --- Key windows ---
  keyWindowOverlapMs: 5 * 60 * 1000,   // 5-minute overlap
  keyGracePeriodMs: 60 * 60 * 1000,    // 1-hour grace before revocation

  // --- Observability ---
  logger: new LoggerService({ level: "info" }),
  metrics: new MetricsService(),

  // --- Resilience ---
  rollbackManager: new RollbackManager(),
  rateLimiter: new RateLimiter({ maxBurst: 5, windowMs: 60_000 }),

  // --- Events ---
  eventEmitter: new EventStore({ baseDir: "./events" }),
});
```

The `createRotationConfig()` helper produces a fully merged configuration with sensible defaults. See the [type definitions](./src/types/config.ts) for every available option.

---

## Provider Support

### AWS Secrets Manager

Uses version stage labels (`AWSCURRENT`, `AWSPENDING`, `AWSPREVIOUS`) for rotation state management. Provider health checks use lightweight `ListSecretVersionIds` calls.

```typescript
import { AWSProvider } from "secret-rotation-kit";

const provider = new AWSProvider({
  region: "us-east-1",
  // endpoint: "http://localhost:4566",  // LocalStack
});
```

### GCP Secret Manager

Tracks rotation state via secret labels (`rotation-status: pending`). Supports custom endpoints for testing.

```typescript
import { GCPProvider } from "secret-rotation-kit";

const provider = new GCPProvider({
  // projectId is read from Application Default Credentials
});
```

### HashiCorp Vault

KV v2 backend with token-based authentication. Supports a static `create()` factory for pre-built clients.

```typescript
import { VaultProvider } from "secret-rotation-kit";

const provider = VaultProvider.create({
  endpoint: "http://127.0.0.1:8200",
  token: process.env.VAULT_TOKEN,
});
```

All providers implement the `SecretProvider` interface. To add a new provider, implement that interface and register it with `ProviderFactory`.

---

## Events

The `RotationManager` emits typed events at each stage of the rotation lifecycle:

| Event | Payload | Description |
|-------|---------|-------------|
| `key_generated` | `KeyGeneratedEvent` | New cryptographic key material created |
| `key_propagated` | `KeyPropagatedEvent` | Key stored in the provider |
| `key_verified` | `KeyVerifiedEvent` | Propagation confirmed by verifier |
| `key_activated` | `KeyActivatedEvent` | New key promoted to active |
| `key_revoked` | `KeyRevokedEvent` | Previous key revoked |
| `rotation_completed` | `RotationEvent` | Full rotation succeeded |
| `rotation_failed` | `RotationFailedEvent` | Rotation failed (includes retry hint and stage) |

```typescript
manager.events.on("key_activated", (event) => {
  console.log(`Key ${event.keyId} active for ${event.secretName}`);
  reloadSecrets();
});

manager.events.on("rotation_failed", (event) => {
  if (event.canRetry) {
    scheduleRetry(event.secretName);
  }
});
```

The `EventStore` persists events to daily JSON-lines files and supports replay by date range.

---

## Error Handling

All errors extend `RotationError`, which provides the rotation stage where the error occurred and whether the operation is retryable:

```typescript
import {
  RotationError,
  ProviderError,
  TimeoutError,
  ConfigurationError,
} from "secret-rotation-kit";

try {
  await manager.rotate("my-secret");
} catch (error) {
  if (error instanceof TimeoutError) {
    // Propagation took too long — the verifier gave up
    console.log(`Timed out at stage: ${error.stage}`);
  } else if (error instanceof ProviderError) {
    // Provider rejected the operation
    console.log(`Provider error: ${error.message}, retryable: ${error.canRetry}`);
  } else if (error instanceof ConfigurationError) {
    // Misconfiguration — fix your config, don't retry
    console.error(`Bad config: ${error.message}`);
  } else {
    throw error;
  }
}
```

In most cases, the `RollbackManager` automatically cancels the provider session, marks the new key as failed, and reactivates the previous key when a rotation fails.

---

## Security

- **Key material is generated** using Node.js `crypto.randomBytes`. Raw buffers are zeroed (`buffer.fill(0)`) immediately after the formatted material is derived.
- **Encryption at rest** is handled by `CryptographicKeyGenerator` using AES-256-GCM with 12-byte IVs per NIST SP 800-38D.
- **FileSystemKeyStore** uses atomic writes (write to temp file → `fs.rename`) to prevent partial writes. File contents can be encrypted with AES-256-GCM.
- **ConfigService** blocks prototype pollution by rejecting `__proto__`, `constructor`, and `prototype` keys during deep merge.
- **RateLimiter** uses per-secret-name token buckets to prevent rotation flooding. Stale buckets are cleaned up after 10 minutes of inactivity.
- **InputValidator** enforces secret name constraints, metadata size/depth limits, and numeric range checks on all configuration inputs.
- **Secrets should be kept short-lived** in memory — formatted/encrypted key material is held as immutable JavaScript strings, which cannot be zeroed. Callers should avoid holding references to secret strings longer than necessary.

---

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Type-check without emitting
pnpm typecheck

# Lint and format
pnpm lint
pnpm lint:fix
pnpm format
```

### Tooling

| Tool | Purpose |
|------|---------|
| [TypeScript](https://www.typescriptlang.org/) 5.x | Language (strict mode) |
| [tsup](https://tsup.egoist.dev) | Build (ESM + CJS + declarations) |
| [Vitest](https://vitest.dev) | Test runner |
| [Biome](https://biomejs.dev) | Linting and formatting |
| [Husky](https://typicode.github.io/husky/) | Git hooks |
| [Changesets](https://github.com/changesets/changesets) | Versioning and changelog |

---

## Documentation

- [Architecture Specification](./ARCHITECTURE.md) — Detailed component design, type definitions, and API contracts
- [Development Plan](./DEV_PLAN.md) — Phased implementation roadmap with milestones
- [Contributing Guide](./CONTRIBUTING.md) — Setup, conventions, and PR process
- [Changelog](./CHANGELOG.md) — Release history and version notes

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, coding standards, and the pull request process.

---

## License

[MIT](./LICENSE) © [ReaaTech](https://github.com/reaatech)
