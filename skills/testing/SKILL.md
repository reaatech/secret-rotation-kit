# Testing Skill

Guidance for comprehensive testing strategies in secret-rotation-kit.

## Test Framework

- **Runner:** Vitest 3.x
- **Globals:** Disabled — import `describe`, `expect`, `it`, `vi` explicitly.
- **Environment:** Node.js
- **Coverage:** v8 provider, reporters: `text` + `json-summary`

## Test Organization

Tests are co-located with source files:

```
packages/core/src/
  rotation-manager.ts
  rotation-manager.test.ts
  rotation-workflow.ts
  rotation-workflow.test.ts
  ...
```

Each `vitest.config.ts` in a package uses the same config:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    coverage: {
      reporter: ['text', 'json-summary'],
    },
  },
});
```

## Running Tests

```bash
# All packages
pnpm test

# Single package
cd packages/core && pnpm test

# With coverage
pnpm test:coverage

# Watch mode (single package)
cd packages/core && pnpm vitest
```

## Mocking Patterns

### Provider Tests

All provider tests use mocked SDK clients. Never require real cloud credentials:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { AWSProvider } from './provider.js';

// The SDK client is mocked internally — AWSProvider accepts
// config and constructs its own client. Test the interface
// behavior, not the SDK internals.
```

### Core Tests

Mock interfaces from `@reaatech/secret-rotation-types`:

```typescript
import type { SecretProvider, KeyStore, EventEmitter } from '@reaatech/secret-rotation-types';

const mockProvider = {
  name: 'test',
  priority: 1,
  getSecret: vi.fn().mockResolvedValue({ value: 'test', versionId: 'v1', createdAt: new Date() }),
  storeSecretValue: vi.fn().mockResolvedValue({ value: 'test', versionId: 'v2', createdAt: new Date() }),
  beginRotation: vi.fn().mockResolvedValue({
    sessionId: 's1',
    secretName: 'test',
    provider: 'test',
    state: {},
    startedAt: new Date(),
  }),
  supportsRotation: () => true,
  // ... remaining methods
} satisfies SecretProvider;
```

### Key Store Tests

Use `tmpdir()` for filesystem-based tests:

```typescript
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'srk-test-'));
const store = new FileSystemKeyStore({ baseDir: dir });
```

## Test Categories

### Unit Tests

- **Key generation** — verify format outputs, encryption/decryption round-trips.
- **Key lifecycle** — verify state transitions and invalid transitions.
- **Error classes** — verify constructors and properties.
- **Input validation** — verify all validation rules and edge cases.
- **Config merging** — verify defaults and prototype pollution protection.
- **Rate limiter** — verify bucket behavior and cleanup.
- **Circuit breaker** — verify state transitions and thresholds.
- **Retry handler** — verify backoff calculation and jitter.

### Integration Tests

- **Rotation workflow** — full 7-step pipeline with mocked provider.
- **Rotation manager** — manual and scheduled rotation.
- **Key stores** — in-memory and file-system CRUD operations.
- **Event emitters** — in-memory and persistent event store.
- **Verification** — polling and active consumer strategies.

### Sidecar Tests

- **HTTP endpoints** — all 5 routes with various inputs.
- **Authentication** — bearer token enforcement.
- **SSE streaming** — event delivery and connection cleanup.
- **CORS** — preflight and header validation.
- **Metrics** — Prometheus format output.

## Test Best Practices

1. **AAA pattern:** Arrange → Act → Assert. Keep sections visually separated.
2. **Test isolation:** Each test should be independent. Use `beforeEach` to reset state.
3. **Descriptive names:** `it('activates a pending key')` not `it('works')`.
4. **Avoid `as any`:** Use `satisfies` for mock objects. If unavoidable, add `// biome-ignore` comment with reason.
5. **Time-dependent tests:** Use real timers for integration tests (sleep + expect). Use `vi.useFakeTimers()` only for unit tests.
6. **Clean up:** Delete temp directories in `afterEach` or `afterAll`.

## CI Integration

- Tests run in GitHub Actions on Node 20 and 22 via matrix strategy.
- Dependencies are cached with `actions/cache@v4`.
- Build artifacts are uploaded/downloaded between jobs.
- Coverage reports are uploaded as artifacts and summarized in the step summary.
