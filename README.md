# secret-rotation-kit

[![CI](https://github.com/reaatech/secret-rotation-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/reaatech/secret-rotation-kit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)

> Zero-downtime multi-key rotation library for production services.

Rotating secrets in production is one of the hardest operational problems to get right. If you revoke the old key before every consumer has picked up the new one, you cause an outage. Secret Rotation Kit orchestrates the full rotation lifecycle across AWS Secrets Manager, GCP Secret Manager, and HashiCorp Vault, with overlapping key windows, propagation verification, automatic rollback, and comprehensive observability.

## Features

- **Zero-downtime rotation** — overlapping key validity windows ensure both old and new keys are valid during transition
- **Multi-provider support** — AWS Secrets Manager, GCP Secret Manager, and HashiCorp Vault with a shared interface
- **Propagation verification** — polling-based and active consumer-level verification to confirm every consumer is using the new key before revoking the old one
- **Resilience by default** — exponential backoff, circuit breaker, automatic rollback, and per-secret rate limiting
- **Full key lifecycle** — state machine tracking every key from pending → active → expired → revoked
- **Structured observability** — JSON logging, Prometheus metrics, and SSE event streaming
- **HTTP sidecar** — REST API with bearer auth, health checks, metrics endpoint, and event streaming

## Installation

### Using the packages

Packages are published under the `@reaatech` scope and can be installed individually:

```bash
# Core rotation engine
pnpm add @reaatech/secret-rotation-core

# Type definitions and interfaces
pnpm add @reaatech/secret-rotation-types

# Logging and metrics
pnpm add @reaatech/secret-rotation-observability

# AWS Secrets Manager adapter
pnpm add @reaatech/secret-rotation-provider-aws

# GCP Secret Manager adapter
pnpm add @reaatech/secret-rotation-provider-gcp

# HashiCorp Vault adapter
pnpm add @reaatech/secret-rotation-provider-vault

# HTTP sidecar server
pnpm add @reaatech/secret-rotation-sidecar
```

### Contributing

```bash
# Clone the repository
git clone https://github.com/reaatech/secret-rotation-kit.git
cd secret-rotation-kit

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run the test suite
pnpm test

# Run linting
pnpm lint
```

## Quick Start

```typescript
import { RotationManager } from '@reaatech/secret-rotation-core';
import { AWSProvider } from '@reaatech/secret-rotation-provider-aws';

const provider = new AWSProvider({ region: 'us-east-1' });

const manager = new RotationManager({
  providerInstance: provider,
  rotationIntervalMs: 24 * 60 * 60 * 1000, // 24 hours
});

// Subscribe to lifecycle events
manager.events.on('key_activated', (event) => {
  console.log(`New key active for ${event.secretName}`);
});

manager.events.on('rotation_failed', (event) => {
  console.error(`Rotation failed for ${event.secretName}: ${event.canRetry ? 'retryable' : 'fatal'}`);
});

// Manual rotation
const result = await manager.rotate('database-password');
console.log(`Rotated in ${result.duration}ms`);

// Scheduled rotation
await manager.start(['database-password', 'api-key']);
```

## Packages

| Package | Description |
| ------- | ----------- |
| [`@reaatech/secret-rotation-core`](./packages/core) | Rotation engine with verification, resilience, and key lifecycle management |
| [`@reaatech/secret-rotation-types`](./packages/types) | Shared type definitions, interfaces, and error classes |
| [`@reaatech/secret-rotation-observability`](./packages/observability) | Structured JSON logging and Prometheus-format metrics |
| [`@reaatech/secret-rotation-provider-aws`](./packages/provider-aws) | AWS Secrets Manager adapter |
| [`@reaatech/secret-rotation-provider-gcp`](./packages/provider-gcp) | GCP Secret Manager adapter |
| [`@reaatech/secret-rotation-provider-vault`](./packages/provider-vault) | HashiCorp Vault KV v2 adapter |
| [`@reaatech/secret-rotation-sidecar`](./packages/sidecar) | HTTP sidecar server with REST API and SSE streaming |

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — System design, package relationships, and data flows
- [`AGENTS.md`](./AGENTS.md) — Coding conventions and development guidelines
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — Contribution workflow and release process

## License

[MIT](LICENSE)
