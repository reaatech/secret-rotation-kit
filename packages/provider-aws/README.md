# @reaatech/secret-rotation-provider-aws

[![npm version](https://img.shields.io/npm/v/@reaatech/secret-rotation-provider-aws.svg)](https://www.npmjs.com/package/@reaatech/secret-rotation-provider-aws)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/secret-rotation-kit/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/secret-rotation-kit/ci.yml?branch=main&label=CI)](https://github.com/reaatech/secret-rotation-kit/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

AWS Secrets Manager adapter for [Secret Rotation Kit](https://github.com/reaatech/secret-rotation-kit). Implements the `SecretProvider` interface using the AWS SDK v3.

## Installation

```bash
npm install @reaatech/secret-rotation-provider-aws @aws-sdk/client-secrets-manager
# or
pnpm add @reaatech/secret-rotation-provider-aws @aws-sdk/client-secrets-manager
```

## Feature Overview

- **Full `SecretProvider` implementation** — CRUD, versioning, rotation sessions, and health checks
- **Native version stage management** — `AWSCURRENT`, `AWSPENDING`, `AWSPREVIOUS` for rotation state
- **LocalStack support** — custom endpoint for local development and testing
- **Version deprecation** — removes all staging labels instead of throwing on unsupported `deleteVersion`

## Quick Start

```typescript
import { AWSProvider } from '@reaatech/secret-rotation-provider-aws';
import { RotationManager } from '@reaatech/secret-rotation-core';

const provider = new AWSProvider({ region: 'us-east-1' });
const manager = new RotationManager({ providerInstance: provider });
await manager.rotate('my-secret');
```

## API Reference

### `AWSProvider`

#### Constructor

```typescript
new AWSProvider(config: AWSProviderConfig)
```

#### `AWSProviderConfig`

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | `"aws"` | Yes | Discriminator |
| `region` | `string` | Yes | AWS region |
| `endpoint` | `string` | No | Custom endpoint for LocalStack or VPC endpoints |

#### SecretProvider Methods

| Method | Description |
|--------|-------------|
| `createSecret(name, value)` | Create a new secret with `CreateSecretCommand` |
| `getSecret(name, version?)` | Get secret value via `GetSecretValueCommand`. Defaults to `AWSCURRENT` stage. |
| `storeSecretValue(name, value, options?)` | Store value via `PutSecretValueCommand`. Use `{ stage: "pending" }` to mark as `AWSPENDING`. |
| `deleteSecret(name, options?)` | Delete secret via `DeleteSecretCommand`. `options.permanent` enables force deletion. |
| `listVersions(name)` | Paginated version listing via `ListSecretVersionIdsCommand` |
| `getVersion(name, versionId)` | Get a specific version's value |
| `deleteVersion(name, versionId)` | Remove all staging labels from a version (AWS has no direct version deletion) |
| `supportsRotation()` | Returns `true` |
| `beginRotation(name)` | Creates a session with `AWSPENDING` stage |
| `completeRotation(session)` | Promotes pending version to `AWSCURRENT` via `UpdateSecretVersionStageCommand` |
| `cancelRotation(session)` | Removes `AWSPENDING` stage from pending version |
| `health()` | Lightweight health check using `ListSecretVersionIdsCommand` |
| `capabilities()` | Returns `supportsRotation: true`, `supportsVersioning: true`, `maxVersions: 100` |

### Rotation Flow

```
beginRotation()           → creates AWSPENDING stage
storeSecretValue(pending) → writes with AWSPENDING label
completeRotation()        → moves AWSPENDING → AWSCURRENT
                           → old AWSCURRENT → AWSPREVIOUS
```

## Usage Patterns

### Local Development with LocalStack

```typescript
const provider = new AWSProvider({
  region: 'us-east-1',
  endpoint: 'http://localhost:4566',
});
```

### Explicit Provider Instance

Rather than using the provider registry, pass the instance directly:

```typescript
import { AWSProvider } from '@reaatech/secret-rotation-provider-aws';
import { RotationManager } from '@reaatech/secret-rotation-core';

const provider = new AWSProvider({ region: 'us-east-1' });
const manager = new RotationManager({ providerInstance: provider });
```

Or use the provider registry for dynamic selection:

```typescript
import '@reaatech/secret-rotation-provider-aws'; // registers 'aws' type
import { createProvider } from '@reaatech/secret-rotation-types';

const provider = createProvider({ type: 'aws', region: 'us-east-1' });
```

## Related Packages

- [`@reaatech/secret-rotation-types`](https://www.npmjs.com/package/@reaatech/secret-rotation-types) — `SecretProvider` interface and config types
- [`@reaatech/secret-rotation-core`](https://www.npmjs.com/package/@reaatech/secret-rotation-core) — Rotation engine
- [`@reaatech/secret-rotation-provider-gcp`](https://www.npmjs.com/package/@reaatech/secret-rotation-provider-gcp) — GCP adapter
- [`@reaatech/secret-rotation-provider-vault`](https://www.npmjs.com/package/@reaatech/secret-rotation-provider-vault) — Vault adapter

## License

[MIT](https://github.com/reaatech/secret-rotation-kit/blob/main/LICENSE)
