# AGENTS.md — secret-rotation-kit

> Agent-focused guidance for contributing to this codebase.

## Project Structure

This is a **pnpm workspace monorepo** managed with Turborepo.

```
packages/
  types/              — Shared type definitions, interfaces, error classes
  observability/      — Structured JSON logging and Prometheus metrics
  core/               — Rotation engine with verification and resilience
  provider-aws/       — AWS Secrets Manager adapter
  provider-gcp/       — GCP Secret Manager adapter
  provider-vault/     — HashiCorp Vault KV v2 adapter
  sidecar/            — HTTP sidecar server with REST API and SSE streaming
```

## Build System

- **Package manager:** pnpm (required)
- **Build tool:** tsup (per-package) + Turborepo (orchestration)
- **Format/Lint:** Biome (not Prettier/ESLint)
- **Test:** Vitest
- **TypeScript:** Strict mode, ESM + CJS dual output

### Common Commands

```bash
# Install all dependencies
pnpm install

# Build everything
pnpm build

# Run all tests
pnpm test

# Lint & format
pnpm lint
pnpm lint:fix

# Type-check without emit
pnpm typecheck
```

## Coding Conventions

1. **Types first:** All shared types and interfaces live in `packages/types`. Never duplicate type definitions across packages.
2. **Pass instances, not configs:** Provider instances are injected via `providerInstance`. Use `import { AWSProvider } from '@reaatech/secret-rotation-provider-aws'` and pass directly to `RotationManager`.
3. **Error handling:** Use typed error classes from `packages/types` (`RotationError`, `ProviderError`, etc.). Include rotation stage and retry hints.
4. **No `any`:** Biome is configured to error on `any`. Use `unknown` + narrowing instead. Test files are exempt via `biome.json` overrides.
5. **Exports:** Always provide ESM + CJS dual output with `types` condition first in `exports`.
6. **Logging:** Use the `Logger` interface from `packages/types`. Implementations live in `packages/observability`. Never `console.log` in library code.
7. **Imports:** Use `verbatimModuleSyntax` mode. Mark type-only imports with the `type` keyword.

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

## Adding a New Package

1. Create `packages/<name>/` with `package.json`, `tsconfig.json`, `vitest.config.ts`, `tsup.config.ts`, `src/index.ts`
2. Add `@reaatech/secret-rotation-types` as a dependency for shared types
3. Add the package name to `tsconfig.typecheck.json` paths
4. Run `pnpm install` from the package directory
5. Add `"@reaatech/secret-rotation-<name>": "workspace:*"` to any dependent packages

## Testing

- Unit tests live next to source files: `src/foo.test.ts`
- Always run `pnpm test` before committing
- Provider tests use mocked SDK clients — do not require real cloud credentials
- Use `vi.fn()` and `vi.mocked()` for mocking; Vitest globals are disabled

## Releasing

- Use `pnpm changeset` to add a changeset
- The [release workflow](./.github/workflows/release.yml) publishes via `changesets/action`
- First publish requires a manual bootstrap from local laptop
- After bootstrap, merges to `main` auto-publish via the Version Packages PR flow
