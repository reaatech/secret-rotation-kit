# @reaatech/secret-rotation-provider-vercel

[![npm version](https://img.shields.io/npm/v/@reaatech/secret-rotation-provider-vercel.svg)](https://www.npmjs.com/package/@reaatech/secret-rotation-provider-vercel)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/secret-rotation-kit/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/secret-rotation-kit/ci.yml?branch=main&label=CI)](https://github.com/reaatech/secret-rotation-kit/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Vercel project **environment variable** provider for [Secret Rotation Kit](https://github.com/reaatech/secret-rotation-kit). Implements the `SecretProvider` interface against the Vercel REST API using the built-in `fetch` — no SDK dependency.

## Installation

```bash
npm install @reaatech/secret-rotation-provider-vercel
# or
pnpm add @reaatech/secret-rotation-provider-vercel
```

Requires Node.js >= 20 (for global `fetch`).

## Feature Overview

- **Full `SecretProvider` implementation** — CRUD, rotation sessions, and health checks
- **No dependencies** — talks to the Vercel REST API directly via `fetch`
- **Target-aware** — writes to one or more deployment targets (`production`, `preview`, `development`)
- **Verification-friendly** — uses the `encrypted` env var type by default so values are readable for propagation verification

## Quick Start

```typescript
import { VercelProvider } from '@reaatech/secret-rotation-provider-vercel';
import { RotationManager } from '@reaatech/secret-rotation-core';

const provider = new VercelProvider({
  token: process.env.VERCEL_TOKEN,
  projectId: 'prj_xxxx…', // project id or name
  teamId: process.env.VERCEL_TEAM_ID, // omit for a personal account
  target: ['production'],
});

const manager = new RotationManager({ providerInstance: provider });
await manager.rotate('DATABASE_URL');
```

## How it maps to Vercel

Vercel has no native secret versioning or staging — a key has one value per
target, and the env var `id` is stable across updates. This provider therefore:

- uses the env var `id` as the version identifier, so propagation verification
  (which re-reads the value) succeeds once the new value is live;
- captures the previous value in the rotation session so a failed rotation can
  be rolled back (Vercel keeps no history);
- writes with the `encrypted` type by default so the value can be read back for
  verification. `sensitive` env vars are write-only — if you choose that type,
  pair it with a custom/active verifier.

> **Propagation note:** Vercel env var changes take effect on the next
> deployment. The provider confirms the new value is readable via the API; live
> propagation to running deployments depends on a redeploy.

## API Reference

### `VercelProvider`

#### Constructor

```typescript
new VercelProvider(config: VercelProviderOptions, fetchImpl?: typeof fetch)
```

Pass a custom `fetch` (second argument) to route requests through a proxy or a
test double; it defaults to the global `fetch`.

#### `VercelProviderOptions`

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `token` | `string` | Yes | Vercel API token ([account/tokens](https://vercel.com/account/tokens)) |
| `projectId` | `string` | Yes | Project id or name |
| `teamId` | `string` | No | Team id (required for team-owned projects) |
| `target` | `("production" \| "preview" \| "development")[]` | No | Targets to write to (default `["production"]`) |
| `envType` | `"encrypted" \| "sensitive"` | No | Env var type (default `"encrypted"`) |
| `apiBaseUrl` | `string` | No | API base URL (default `https://api.vercel.com`) |

#### SecretProvider Methods

| Method | Description |
|--------|-------------|
| `createSecret(name, value)` | Create an env var (`POST /v10/projects/{id}/env`) |
| `getSecret(name, version?)` | Read the current (or a specific) env var, decrypted |
| `storeSecretValue(name, value, options?)` | Upsert the env var value (`upsert=true`) |
| `deleteSecret(name, options?)` | Delete the env var |
| `listVersions(name)` | List matching env vars (Vercel keeps a single current value per target) |
| `getVersion(name, versionId)` | Read a specific env var by id |
| `deleteVersion(name, versionId)` | Delete an env var by id |
| `beginRotation(name)` | Capture the current value for potential rollback |
| `completeRotation(session)` | Finalize the rotated value |
| `cancelRotation(session)` | Restore the previous value (or remove a newly created one) |
| `health()` | Lists env vars to confirm API connectivity |
| `capabilities()` | `supportsRotation: true`, `supportsVersioning: false`, `maxVersions: 1` |

## Related Packages

- [`@reaatech/secret-rotation-types`](https://www.npmjs.com/package/@reaatech/secret-rotation-types) — `SecretProvider` interface and config types
- [`@reaatech/secret-rotation-core`](https://www.npmjs.com/package/@reaatech/secret-rotation-core) — Rotation engine
- [`@reaatech/secret-rotation-provider-aws`](https://www.npmjs.com/package/@reaatech/secret-rotation-provider-aws) — AWS adapter

## License

[MIT](https://github.com/reaatech/secret-rotation-kit/blob/main/LICENSE)
