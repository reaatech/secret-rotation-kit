# Secret Rotation Kit — Architecture Specification

## System Overview

Secret Rotation Kit is a **pnpm workspace monorepo** that orchestrates zero-downtime secret rotation across multiple cloud providers. The architecture follows a layered design with clean package boundaries, provider abstraction, and event-driven rotation workflows.

## Package Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Application Layer                         │
│                                                                   │
│  ┌──────────────────────┐  ┌───────────────────────────────────┐ │
│  │  @reaatech/           │  │  @reaatech/                       │ │
│  │  secret-rotation-     │  │  secret-rotation-                 │ │
│  │  sidecar              │  │  sidecar                          │ │
│  │  (HTTP server, REST   │  │  (HTTP server, REST               │ │
│  │   API, SSE streaming) │  │   API, SSE streaming)             │ │
│  └──────────┬───────────┘  └───────────────┬───────────────────┘ │
│             │                               │                     │
└─────────────┼───────────────────────────────┼─────────────────────┘
              │                               │
              ▼                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                         Core Services Layer                       │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  @reaatech/secret-rotation-core                              │ │
│  │                                                               │ │
│  │  ┌──────────────────┐  ┌──────────────────┐                 │ │
│  │  │ RotationManager  │  │ RotationWorkflow │                 │ │
│  │  │ (primary API)    │  │ (7-step pipeline)│                 │ │
│  │  └──────────────────┘  └──────────────────┘                 │ │
│  │                                                               │ │
│  │  ┌──────────────────┐  ┌──────────────────┐                 │ │
│  │  │ KeyLifecycle     │  │ KeyWindow        │                 │ │
│  │  │ Manager          │  │ Manager          │                 │ │
│  │  │ (state machine)  │  │ (overlap windows)│                 │ │
│  │  └──────────────────┘  └──────────────────┘                 │ │
│  │                                                               │ │
│  │  ┌──────────────────┐  ┌──────────────────┐                 │ │
│  │  │ PollingVerifier  │  │ ActiveVerifier   │                 │ │
│  │  │ (provider polls) │  │ (consumer checks)│                 │ │
│  │  └──────────────────┘  └──────────────────┘                 │ │
│  │                                                               │ │
│  │  ┌──────────┐ ┌─────────────┐ ┌────────────┐                │ │
│  │  │ Retry    │ │ Circuit     │ │ Rollback   │                │ │
│  │  │ Handler  │ │ Breaker     │ │ Manager    │                │ │
│  │  └──────────┘ └─────────────┘ └────────────┘                │ │
│  │                                                               │ │
│  │  ┌──────────┐ ┌─────────────┐ ┌────────────┐                │ │
│  │  │ Rate     │ │ Input       │ │ Config     │                │ │
│  │  │ Limiter  │ │ Validator   │ │ Service    │                │ │
│  │  └──────────┘ └─────────────┘ └────────────┘                │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐ │
│  │  @reaatech/              │  │  @reaatech/                  │ │
│  │  secret-rotation-        │  │  secret-rotation-            │ │
│  │  observability           │  │  types                       │ │
│  │  (LoggerService,         │  │  (all shared types,          │ │
│  │   MetricsService)        │  │   interfaces, errors,        │ │
│  │                          │  │   provider registry)         │ │
│  └──────────────────────────┘  └──────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────┐
│                        Provider Layer                             │
│                                                                   │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────────┐   │
│  │ @reaatech/     │ │ @reaatech/     │ │ @reaatech/         │   │
│  │ secret-rotation│ │ secret-rotation│ │ secret-rotation    │   │
│  │ -provider-aws  │ │ -provider-gcp  │ │ -provider-vault    │   │
│  │                │ │                │ │                    │   │
│  │ AWSProvider    │ │ GCPProvider    │ │ VaultProvider      │   │
│  │ (version       │ │ (label-based   │ │ (KV v2, token/    │   │
│  │  stages:       │ │  rotation      │ │  AppRole auth)    │   │
│  │  AWSCURRENT,   │ │  tracking)     │ │                    │   │
│  │  AWSPENDING)   │ │                │ │                    │   │
│  └────────────────┘ └────────────────┘ └────────────────────┘   │
│                                                                   │
│  All implement the SecretProvider interface from                  │
│  @reaatech/secret-rotation-types                                 │
└──────────────────────────────────────────────────────────────────┘
```

## Package Dependency Graph

```
types (zero deps)
  ↑
  ├── observability (→ types)
  ├── core (→ types, observability)
  │     ↑
  │     └── sidecar (→ types, core, observability)
  ├── provider-aws (→ types)
  ├── provider-gcp (→ types)
  └── provider-vault (→ types)
```

Providers optionally self-register via the provider registry in `types`. This enables dynamic provider creation from configuration without core knowing about specific provider packages at compile time.

## Core Package: `@reaatech/secret-rotation-core`

### RotationManager

The primary public API. Wires together provider, key store, verifier, rate limiter, rollback manager, and event emitter into a single ergonomic interface.

**Key design decision:** Provider instances are injected via `providerInstance` (not auto-created from config). This keeps core decoupled from specific provider packages. Users import the provider they need explicitly:

```typescript
import { AWSProvider } from '@reaatech/secret-rotation-provider-aws';
import { RotationManager } from '@reaatech/secret-rotation-core';

const manager = new RotationManager({
  providerInstance: new AWSProvider({ region: 'us-east-1' }),
});
```

Alternatively, the provider registry pattern (in `types`) allows dynamic creation:

```typescript
import '@reaatech/secret-rotation-provider-aws'; // side-effect registers 'aws' type
import { createProvider } from '@reaatech/secret-rotation-types';

const provider = createProvider({ type: 'aws', region: 'us-east-1' });
```

### Rotation Lifecycle

The `RotationWorkflow` executes a 7-step pipeline:

```
1. Generate key    → CryptographicKeyGenerator (crypto.randomBytes, AES-256-GCM)
2. Save to store   → KeyStore (InMemoryKeyStore or FileSystemKeyStore)
3. Begin session   → provider.beginRotation()
4. Store value     → provider.storeSecretValue() with stage: "pending"
5. Verify          → PropagationVerifier (polling or active consumer checks)
6. Activate        → KeyLifecycleManager (pending → active, old → expired)
7. Complete       → provider.completeRotation(), revoke old key after grace period
```

Each step emits a typed event via the `EventEmitter`.

### Verification Strategies

| Strategy | Class | Mechanism |
|----------|-------|-----------|
| Provider polling | `PollingPropagationVerifier` | Polls the provider in a loop until the new version is readable |
| Active consumer | `ActivePropagationVerifier` | HTTP health/version checks against registered consumers |
| Passive (planned) | — | Monitors consumer key usage and error rates |

### Resilience Patterns

| Component | Pattern | Purpose |
|-----------|---------|---------|
| `RetryHandler` | Exponential backoff + full jitter | Transient failures during verification |
| `CircuitBreaker` | Closed → Open → Half-Open | Fault tolerance for external calls |
| `RollbackManager` | Automatic rollback | Cancel provider session, mark key failed, reactivate previous key |
| `KeyWindowManager` | Overlapping windows | Old and new keys valid simultaneously for configurable overlap |
| `RateLimiter` | Token bucket per secret | Prevent rotation flooding |

### Key Lifecycle State Machine

```
                      ┌──────────┐
                      │  pending  │
                      └────┬─────┘
                           │ activate()
              ┌────────────▼────────────┐
              │         active          │
              └──┬──────────────────┬──┘
                 │ next rotation    │ expire()
                 ▼                  ▼
         ┌──────────┐       ┌──────────┐
         │  expired  │       │  failed  │
         └────┬─────┘       └──────────┘
              │ revoke()
              ▼
         ┌──────────┐
         │  revoked  │
         └──────────┘
```

### Event System

| Event | When |
|-------|------|
| `key_generated` | New key material created |
| `key_propagated` | Key stored in provider |
| `key_verified` | Propagation confirmed by verifier |
| `key_activated` | New key promoted to active |
| `key_revoked` | Old key revoked |
| `rotation_failed` | Rotation failed with retry hint and stage |

Events are emitted via the `EventEmitter` interface. Two implementations:
- `InMemoryEventEmitter` — in-process event bus with bounded history replay
- `EventStore` — disk-persisted JSON-lines event log with date-range replay

### Key Storage Backends

| Backend | Use Case |
|---------|----------|
| `InMemoryKeyStore` | Development, testing, single-process |
| `FileSystemKeyStore` | Persistent, single-file-per-secret, optional AES-256-GCM encryption |

## Types Package: `@reaatech/secret-rotation-types`

The foundation package. Contains all shared type definitions, abstract interfaces, and error classes. Zero runtime dependencies.

Key exports:
- **Core types:** `SecretKey`, `KeyStatus`, `RotationState`, `RotationEvent`, `RotationSession`
- **Verification types:** `Consumer`, `VerificationResult`, `RetryPolicy`, `VerificationOptions`
- **Config types:** `RotationConfig`, `SchedulingConfig`, `VerificationConfig`, `KeyWindowConfig`
- **Provider types:** `ProviderConfig`, `AWSProviderConfig`, `GCPProviderConfig`, `VaultProviderConfig`
- **Interfaces:** `SecretProvider`, `KeyStore`, `KeyGenerator`, `Logger`, `EventEmitter`, `PropagationVerifier`, `ConsumerRegistry`
- **Errors:** `RotationError`, `ProviderError`, `PropagationError`, `VerificationError`, `TimeoutError`, `ConfigurationError`
- **Registry:** `registerProvider`, `createProvider`, `getRegisteredTypes`

## Observability Package: `@reaatech/secret-rotation-observability`

Standalone observability layer. Depends only on `types`.

| Export | Description |
|--------|-------------|
| `LoggerService` | Structured JSON logger (newline-delimited to stderr) with level filtering |
| `MetricsService` | Prometheus-format metrics: `Counter`, `Gauge`, `Histogram`, `Summary` |

## Provider Packages

Each provider implements the `SecretProvider` interface from `types`. Providers optionally self-register via `registerProvider()` on import.

### AWS (`@reaatech/secret-rotation-provider-aws`)
- Uses `@aws-sdk/client-secrets-manager` v3
- Rotation via native version stages: `AWSCURRENT`, `AWSPENDING`, `AWSPREVIOUS`
- Supports custom endpoints (LocalStack)

### GCP (`@reaatech/secret-rotation-provider-gcp`)
- Uses `@google-cloud/secret-manager`
- Rotation via secret labels: `rotation-status`, `pending-version`
- Supports custom API endpoints

### Vault (`@reaatech/secret-rotation-provider-vault`)
- Dynamic `node-vault` loading via `createRequire` for ESM compatibility
- KV v2 backend with automatic versioning
- Token and AppRole authentication

## Sidecar Package: `@reaatech/secret-rotation-sidecar`

HTTP server built on Node.js `http.createServer`. No framework dependencies.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/rotate` | POST | Trigger a secret rotation |
| `/secrets/:name` | GET | Get rotation state for a secret |
| `/health` | GET | Health check |
| `/metrics` | GET | Prometheus metrics |
| `/events` | GET | SSE event stream |

Features: bearer auth on write endpoints, CORS support, built-in Prometheus metric counters.

## Data Flow: Complete Rotation

```
User/Trigger
    │
    ▼
RotationManager.rotate(secretName)
    │
    ├── RateLimiter.consume()              — prevent flooding
    ├── InputValidator.validateSecretName() — input safety
    │
    ▼
RotationWorkflow.execute()
    │
    ├── 1. KeyGenerator.generate()         — crypto.randomBytes
    │       └── emit key_generated
    ├── 2. KeyStore.save()
    ├── 3. provider.beginRotation()        — AWS: AWSPENDING, GCP: labels, Vault: metadata
    ├── 4. provider.storeSecretValue()     — write with stage: "pending"
    │       └── emit key_propagated
    ├── 5. PropagationVerifier.verify()    — poll provider or check consumers
    │       └── emit key_verified
    ├── 6. KeyLifecycleManager.activate()  — pending→active, old→expired
    │       └── emit key_activated
    ├── 7. provider.completeRotation()     — promote pending version
    │
    └── On failure: RollbackManager.rollback()
            ├── Cancel provider session
            ├── Mark key as failed
            └── Reactivate previous key
```

## Security Design

- **Key generation:** `crypto.randomBytes` in `CryptographicKeyGenerator`. Buffers zeroed after formatting.
- **At-rest encryption:** AES-256-GCM with 12-byte IVs per NIST SP 800-38D.
- **Atomic writes:** `FileSystemKeyStore` writes to temp file then `fs.rename`. Permissions set to `0o600`.
- **Prototype pollution:** `ConfigService` blocks `__proto__`, `constructor`, `prototype` keys during deep merge.
- **Rate limiting:** Per-secret token bucket. Stale buckets auto-cleaned after 10 minutes.
- **Input validation:** Secret name constraints (`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$`), metadata size/depth limits, numeric range checks.

## Testing Strategy

- **Unit tests:** Co-located with source (`src/*.test.ts`). Use Vitest with `vi.fn()` mocks.
- **Provider tests:** Use mocked SDK clients — no real cloud credentials required.
- **Key stores:** Test both in-memory and file-system backends with `tmpdir()` for isolation.
- **Time-dependent tests:** Use real timers where possible; polling verifier uses timeouts.

```bash
pnpm test          # all packages
pnpm test:coverage # with coverage reports
```

## Build & Toolchain

| Tool | Purpose |
|------|---------|
| pnpm | Package manager with workspace support |
| Turborepo | Task orchestration and caching |
| tsup | Per-package build (CJS + ESM + DTS) |
| Biome | Linting and formatting (no ESLint/Prettier) |
| Vitest | Test runner |
| Changesets | Versioning and changelog generation |
| GitHub Actions | CI/CD pipeline |
