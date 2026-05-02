# @reaatech/secret-rotation-provider-gcp

[![npm version](https://img.shields.io/npm/v/@reaatech/secret-rotation-provider-gcp.svg)](https://www.npmjs.com/package/@reaatech/secret-rotation-provider-gcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/secret-rotation-kit/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/secret-rotation-kit/ci.yml?branch=main&label=CI)](https://github.com/reaatech/secret-rotation-kit/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

GCP Secret Manager adapter for [Secret Rotation Kit](https://github.com/reaatech/secret-rotation-kit). Implements the `SecretProvider` interface using the `@google-cloud/secret-manager` SDK.

## Installation

```bash
npm install @reaatech/secret-rotation-provider-gcp @google-cloud/secret-manager
# or
pnpm add @reaatech/secret-rotation-provider-gcp @google-cloud/secret-manager
```

## Feature Overview

- **Full `SecretProvider` implementation** — CRUD, versioning, rotation sessions, and health checks
- **Label-based rotation tracking** — uses `rotation-status` and `pending-version` labels (GCP has no native stage labels)
- **Custom endpoints** — support for emulators and private API endpoints
- **Automatic version tracking** — new writes create new versions automatically

## Quick Start

```typescript
import { GCPProvider } from '@reaatech/secret-rotation-provider-gcp';
import { RotationManager } from '@reaatech/secret-rotation-core';

const provider = new GCPProvider({ projectId: 'my-gcp-project' });
const manager = new RotationManager({ providerInstance: provider });
await manager.rotate('my-secret');
```

## API Reference

### `GCPProvider`

#### Constructor

```typescript
new GCPProvider(config: GCPProviderConfig)
```

#### `GCPProviderConfig`

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | `"gcp"` | Yes | Discriminator |
| `projectId` | `string` | Yes | GCP project ID |
| `endpoint` | `string` | No | Custom endpoint for emulators or private APIs |

#### SecretProvider Methods

| Method | Description |
|--------|-------------|
| `createSecret(name, value)` | Create a new secret with replication set to automatic |
| `getSecret(name, version?)` | Get secret value. Defaults to latest version. |
| `storeSecretValue(name, value, options?)` | Add a new version. `{ stage: "pending" }` sets `rotation-status: pending` label. |
| `deleteSecret(name, options?)` | Delete a secret |
| `listVersions(name)` | List all versions with labels |
| `getVersion(name, versionId)` | Get a specific version's value |
| `deleteVersion(name, versionId)` | Destroy a specific version |
| `supportsRotation()` | Returns `true` |
| `beginRotation(name)` | Creates a session. Marks the latest version as pending via label. |
| `completeRotation(session)` | Promotes pending version by removing the `rotation-status` label |
| `cancelRotation(session)` | Removes rotation labels from pending version |
| `health()` | Lightweight health check using `listVersions` with page size 1 |
| `capabilities()` | Returns `supportsRotation: true`, `supportsVersioning: true`, `supportsLabels: true` |

### Rotation Flow

```
beginRotation()           → marks latest version with rotation-status label
storeSecretValue(pending) → creates new version with pending label
completeRotation()        → removes rotation-status, promotes pending version
cancelRotation()          → cleans up rotation labels
```

## Usage Patterns

### Explicit Provider Instance

```typescript
import { GCPProvider } from '@reaatech/secret-rotation-provider-gcp';
import { RotationManager } from '@reaatech/secret-rotation-core';

const provider = new GCPProvider({ projectId: 'my-gcp-project' });
const manager = new RotationManager({ providerInstance: provider });
```

### Dynamic Provider Selection

```typescript
import '@reaatech/secret-rotation-provider-gcp'; // registers 'gcp' type
import { createProvider } from '@reaatech/secret-rotation-types';

const provider = createProvider({ type: 'gcp', projectId: 'my-gcp-project' });
```

## Related Packages

- [`@reaatech/secret-rotation-types`](https://www.npmjs.com/package/@reaatech/secret-rotation-types) — `SecretProvider` interface and config types
- [`@reaatech/secret-rotation-core`](https://www.npmjs.com/package/@reaatech/secret-rotation-core) — Rotation engine
- [`@reaatech/secret-rotation-provider-aws`](https://www.npmjs.com/package/@reaatech/secret-rotation-provider-aws) — AWS adapter
- [`@reaatech/secret-rotation-provider-vault`](https://www.npmjs.com/package/@reaatech/secret-rotation-provider-vault) — Vault adapter

## License

[MIT](https://github.com/reaatech/secret-rotation-kit/blob/main/LICENSE)
