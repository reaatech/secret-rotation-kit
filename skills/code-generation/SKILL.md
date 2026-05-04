# Code Generation Skill

Guidance for writing production-ready TypeScript code in secret-rotation-kit.

## Project Conventions

### Monorepo Structure

All code lives under `packages/<name>/src/`. Each package is independently built with tsup (CJS + ESM + DTS). Tests are co-located as `*.test.ts` next to source files.

### Import Rules

- Use `verbatimModuleSyntax` mode — add `type` keyword to type-only imports.
- Cross-package imports use workspace package names:
  - `from '@reaatech/secret-rotation-types'`
  - `from '@reaatech/secret-rotation-observability'`
  - `from '@reaatech/secret-rotation-core'`
- Within-package imports use relative paths with `.js` extensions (NodeNext module resolution).

### Package Boundaries

| Package | What belongs |
|---------|-------------|
| `types` | Type definitions, interfaces, error classes. NO runtime logic that depends on other packages. |
| `observability` | `LoggerService` and `MetricsService` implementations. Depends only on `types`. |
| `core` | Rotation engine, workflow, verifiers, resilience patterns, key stores, key generator, config, rate limiter, input validator. |
| `provider-*` | Single provider implementation. Implements `SecretProvider` from `types`. Self-registers via `registerProvider()`. |
| `sidecar` | HTTP server, SSE streaming. Depends on `core`, `types`, `observability`. |

## TypeScript Standards

- **Strict mode** — all strict flags enabled.
- **No `any`** — use `unknown` + narrowing instead. Test files exempt via `biome.json`.
- **Explicit return types** on public API methods.
- **Named exports** preferred over default exports.
- **Interfaces for contracts** (`SecretProvider`, `KeyStore`), **type aliases** for data shapes.

## Error Handling

Use the error hierarchy from `@reaatech/secret-rotation-types`:

```typescript
import { RotationError, ProviderError, TimeoutError } from '@reaatech/secret-rotation-types';

throw new ProviderError('AWS returned 500', 'aws', 'propagation', true);
throw new TimeoutError('Verification timed out', 'verification', true);
```

- Include `stage` (which rotation phase failed).
- Include `canRetry` (whether the operation is safe to retry).
- `ConfigurationError` is NOT retryable.

## Provider Implementation Pattern

```typescript
import type { SecretProvider, RotationSession, SecretValue, ProviderHealth } from '@reaatech/secret-rotation-types';
import type { AWSProviderConfig } from '@reaatech/secret-rotation-types';

export class AWSProvider implements SecretProvider {
  name = 'aws-secrets-manager';
  priority = 1;

  constructor(config: AWSProviderConfig) {
    // initialize SDK client
  }

  async getSecret(name: string): Promise<SecretValue> { /* ... */ }
  async storeSecretValue(name: string, value: string, options?: { stage?: 'current' | 'pending' }): Promise<SecretValue> { /* ... */ }
  // ... all SecretProvider methods
}
```

## Logging

Use the `Logger` interface from `@reaatech/secret-rotation-types`. Never `console.log` in library code.

```typescript
import type { Logger } from '@reaatech/secret-rotation-types';

class MyComponent {
  constructor(private logger?: Logger) {}

  async doWork() {
    this.logger?.info('Starting work', { secret: 'db-password' });
    this.logger?.error('Work failed', { error: 'reason' });
  }
}
```

## Testing Patterns

- Use `vi.fn()` for mocking. Vitest globals are disabled — import explicitly.
- Mock SDK clients for provider tests — no real cloud credentials.
- Use `tmpdir()` for file-system key store tests.

```typescript
import { describe, expect, it, vi } from 'vitest';

describe('AWSProvider', () => {
  it('stores secret value', async () => {
    const provider = new AWSProvider({ region: 'us-east-1' });
    // mock the SDK client internally
  });
});
```

## Biome Linting

- Run `pnpm lint` before committing.
- Use `pnpm lint:fix` for auto-fixable issues.
- Only add `// biome-ignore` comments when necessary. Prefer fixing the issue.
- Test files have `noExplicitAny` disabled via `biome.json` overrides.
