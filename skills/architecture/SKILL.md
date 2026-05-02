# Architecture Skill

Guidance for system design and architecture decisions in secret-rotation-kit.

## Project Structure

This is a **pnpm workspace monorepo** with 7 packages under `packages/`:

```
packages/
  types/              — Shared types, interfaces, and error classes (zero deps)
  observability/      — LoggerService and MetricsService (depends on types)
  core/               — Rotation engine, verification, resilience (depends on types, observability)
  provider-aws/       — AWS Secrets Manager adapter (depends on types)
  provider-gcp/       — GCP Secret Manager adapter (depends on types)
  provider-vault/     — HashiCorp Vault adapter (depends on types)
  sidecar/            — HTTP sidecar server (depends on types, core, observability)
```

## Design Principles

1. **Interface-first design** — All contracts live in `packages/types`. Concrete implementations satisfy them.
2. **Pass instances, not configs** — Providers are injected via `providerInstance`, not auto-created from config.
3. **Explicit dependency graphs** — Package-level dependencies are clear. No circular dependencies.
4. **Provider abstraction** — All providers implement `SecretProvider` from `types`. Core never imports provider packages directly.
5. **Event-driven lifecycle** — Every rotation stage emits typed events. Event emitters support in-memory and persistent backends.

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

## Key Architecture Decisions

### ADR-001: Monorepo with Independent Packages

Each package is independently publishable. Users install only what they need. Internal dependencies use `workspace:*` protocol resolved at publish time.

### ADR-002: Provider Instance Injection

Rather than having core create providers from config (which would couple core to all provider packages), providers are instantiated by the user and passed to `RotationManager` via `providerInstance`. An optional provider registry in `types` enables dynamic creation for convenience without coupling.

### ADR-003: Types Package as Foundation

All shared types, interfaces, and error classes live in `packages/types`. This package has zero runtime dependencies. Every other package depends on it. This prevents type duplication and ensures consistency.

### ADR-004: Dual Verification Strategies

Propagation verification is the hardest part of zero-downtime rotation. Two complementary strategies:
- **Polling** (`PollingPropagationVerifier`): polls the provider directly — simple, works without consumer cooperation.
- **Active** (`ActivePropagationVerifier`): HTTP checks against registered consumers — more thorough, requires consumer cooperation.

### ADR-005: Overlapping Key Windows

The `KeyWindowManager` ensures old and new keys coexist during `overlapPeriodMs` (default 5 minutes). Old keys enter a grace period after activation before revocation. This prevents outages when some consumers are slower to pick up the new key.

## Adding a New Package

1. Create `packages/<name>/` with `package.json`, `tsconfig.json`, `vitest.config.ts`, `tsup.config.ts`, `src/index.ts`
2. Add `@reaatech/secret-rotation-types` as a dependency
3. Add to `tsconfig.typecheck.json` path mappings
4. Run `pnpm install` from the package directory
5. Add `workspace:*` dependency to any consuming packages

## Adding a New Provider

1. Create `packages/provider-<name>/`
2. Implement the `SecretProvider` interface from `@reaatech/secret-rotation-types`
3. Optionally call `registerProvider('name', ProviderClass)` in your index.ts barrel
4. Add the provider's SDK as a direct dependency

## Scaling Considerations

- **Horizontal scaling:** Each `RotationManager` instance is independent. Use a distributed key store or shared event bus for multi-process deployments.
- **Consumer grouping:** `ConsumerRegistry` supports consumer groups for staged rollouts.
- **Rate limiting:** Per-secret token buckets prevent rotation flooding. Default: 5 requests per 60 seconds.
