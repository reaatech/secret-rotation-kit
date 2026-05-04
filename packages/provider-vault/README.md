# @reaatech/secret-rotation-provider-vault

[![npm version](https://img.shields.io/npm/v/@reaatech/secret-rotation-provider-vault.svg)](https://www.npmjs.com/package/@reaatech/secret-rotation-provider-vault)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/secret-rotation-kit/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/secret-rotation-kit/ci.yml?branch=main&label=CI)](https://github.com/reaatech/secret-rotation-kit/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

HashiCorp Vault KV v2 adapter for [Secret Rotation Kit](https://github.com/reaatech/secret-rotation-kit). Implements the `SecretProvider` interface for Vault's key-value secrets engine.

## Installation

```bash
npm install @reaatech/secret-rotation-provider-vault node-vault
# or
pnpm add @reaatech/secret-rotation-provider-vault node-vault
```

## Feature Overview

- **Full `SecretProvider` implementation** — CRUD, versioning, rotation sessions, and health checks
- **KV v2 backend** — automatic versioning on every write
- **Token and AppRole auth** — supports both `token` and `roleId`/`secretId` authentication
- **ESM-compatible** — dynamically loads `node-vault` via `createRequire` for pure-ESM consumers
- **Metadata tracking** — rotation state tracked via custom metadata on secret versions

## Quick Start

```typescript
import { VaultProvider } from '@reaatech/secret-rotation-provider-vault';
import { RotationManager } from '@reaatech/secret-rotation-core';

const provider = new VaultProvider({
  url: 'http://localhost:8200',
  mountPath: 'secret',
  token: 'hvs.xxxx',
});
const manager = new RotationManager({ providerInstance: provider });
await manager.rotate('database-password');
```

## API Reference

### `VaultProvider`

#### Constructor

```typescript
new VaultProvider(config: VaultProviderConfig)
```

#### `VaultProviderConfig`

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | `"vault"` | Yes | Discriminator |
| `url` | `string` | Yes | Vault server URL |
| `mountPath` | `string` | Yes | KV engine mount path (e.g., `"secret"`) |
| `token` | `string` | No | Authentication token |
| `roleId` | `string` | No | Role ID for AppRole authentication |
| `secretId` | `string` | No | Secret ID for AppRole authentication |

#### SecretProvider Methods

| Method | Description |
|--------|-------------|
| `createSecret(name, value)` | Write initial secret value to KV v2 path |
| `getSecret(name, version?)` | Read secret value. Defaults to latest version. |
| `storeSecretValue(name, value, options?)` | Write new version. New writes auto-create versions in KV v2. `{ stage: "pending" }` sets pending metadata. |
| `deleteSecret(name, options?)` | Delete secret path and all versions |
| `listVersions(name)` | List all versions with creation timestamps and metadata |
| `getVersion(name, versionId)` | Read a specific version by ID |
| `deleteVersion(name, versionId)` | Delete a specific version |
| `supportsRotation()` | Returns `true` |
| `beginRotation(name)` | Creates a rotation session with initial metadata |
| `completeRotation(session)` | Promotes pending version (removes rotation metadata) |
| `cancelRotation(session)` | Removes rotation metadata from pending version |
| `health()` | Health check via Vault's `/sys/health` endpoint |
| `capabilities()` | Returns `supportsRotation: true`, `supportsVersioning: true`, `supportsLabels: false` |

### Rotation Flow

```
beginRotation()           → creates session metadata on the secret
storeSecretValue(pending) → writes new KV v2 version with pending metadata
completeRotation()        → promotes pending version, removes rotation metadata
cancelRotation()          → cleans up pending metadata
```

## Usage Patterns

### Token Authentication

```typescript
const provider = new VaultProvider({
  url: 'https://vault.example.com',
  mountPath: 'secret',
  token: process.env.VAULT_TOKEN,
});
```

### AppRole Authentication

```typescript
const provider = new VaultProvider({
  url: 'https://vault.example.com',
  mountPath: 'kv',
  roleId: process.env.VAULT_ROLE_ID,
  secretId: process.env.VAULT_SECRET_ID,
});
```

### Explicit Provider Instance

```typescript
import { VaultProvider } from '@reaatech/secret-rotation-provider-vault';
import { RotationManager } from '@reaatech/secret-rotation-core';

const provider = new VaultProvider({
  url: 'http://localhost:8200',
  mountPath: 'secret',
  token: 'hvs.xxxx',
});
const manager = new RotationManager({ providerInstance: provider });
```

### Dynamic Provider Selection

```typescript
import '@reaatech/secret-rotation-provider-vault'; // registers 'vault' type
import { createProvider } from '@reaatech/secret-rotation-types';

const provider = createProvider({
  type: 'vault',
  url: 'http://localhost:8200',
  mountPath: 'secret',
  token: 'hvs.xxxx',
});
```

## Related Packages

- [`@reaatech/secret-rotation-types`](https://www.npmjs.com/package/@reaatech/secret-rotation-types) — `SecretProvider` interface and config types
- [`@reaatech/secret-rotation-core`](https://www.npmjs.com/package/@reaatech/secret-rotation-core) — Rotation engine
- [`@reaatech/secret-rotation-provider-aws`](https://www.npmjs.com/package/@reaatech/secret-rotation-provider-aws) — AWS adapter
- [`@reaatech/secret-rotation-provider-gcp`](https://www.npmjs.com/package/@reaatech/secret-rotation-provider-gcp) — GCP adapter

## License

[MIT](https://github.com/reaatech/secret-rotation-kit/blob/main/LICENSE)
