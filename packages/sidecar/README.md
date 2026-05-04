# @reaatech/secret-rotation-sidecar

[![npm version](https://img.shields.io/npm/v/@reaatech/secret-rotation-sidecar.svg)](https://www.npmjs.com/package/@reaatech/secret-rotation-sidecar)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/secret-rotation-kit/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/secret-rotation-kit/ci.yml?branch=main&label=CI)](https://github.com/reaatech/secret-rotation-kit/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

HTTP sidecar server for [Secret Rotation Kit](https://github.com/reaatech/secret-rotation-kit). Exposes rotation operations, health checks, Prometheus metrics, and SSE event streaming over a REST API. Built on Node.js's built-in `http` module with zero framework dependencies.

## Installation

```bash
npm install @reaatech/secret-rotation-sidecar
# or
pnpm add @reaatech/secret-rotation-sidecar
```

## Feature Overview

- **REST API** — trigger rotations, query secret state, check health, export metrics
- **SSE streaming** — real-time rotation event stream for external consumers
- **Bearer auth** — optional shared-secret authentication on write endpoints
- **CORS support** — configurable origin for browser-based clients
- **Built-in metrics** — automatic Prometheus counters for rotation requests and failures
- **Zero framework dependencies** — uses Node.js `http.createServer` directly
- **Graceful shutdown** — closes SSE connections on server stop

## Quick Start

```typescript
import { RotationManager } from '@reaatech/secret-rotation-core';
import { AWSProvider } from '@reaatech/secret-rotation-provider-aws';
import { SidecarServer } from '@reaatech/secret-rotation-sidecar';

const provider = new AWSProvider({ region: 'us-east-1' });
const manager = new RotationManager({ providerInstance: provider });

const server = new SidecarServer({
  manager,
  port: 8080,
  authToken: process.env.SIDECAR_AUTH_TOKEN,
});

await server.start();
console.log(`Sidecar running at ${server.address}`);
```

## API Reference

### `SidecarServer`

#### Constructor

```typescript
new SidecarServer(options: SidecarOptions)
```

#### `SidecarOptions`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `manager` | `RotationManager` | (required) | Rotation manager instance |
| `port` | `number` | `8080` | HTTP server port |
| `host` | `string` | `"127.0.0.1"` | Bind address |
| `eventEmitter` | `EventEmitter` | — | Event source for SSE streaming |
| `metrics` | `MetricsService` | `MetricsService()` | Metrics collector |
| `logger` | `Logger` | — | Structured logger |
| `corsOrigin` | `string` | `"http://localhost:*"` | Allowed CORS origin |
| `authToken` | `string` | — | Bearer token for write endpoint auth |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `start()` | `Promise<void>` | Start the HTTP server |
| `stop()` | `Promise<void>` | Stop the server and close SSE connections |
| `address` | `string` | Server address as `http://host:port` |
| `listeningPort` | `number` | Actual port (useful when port is set to 0) |

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/rotate` | Bearer | Trigger a secret rotation. Body: `{ "secretName": "...", "force": false }` |
| `GET` | `/secrets/:name` | Bearer | Get rotation state for a secret |
| `GET` | `/health` | — | Health check. Returns `{ status: "healthy", timestamp, uptime }` |
| `GET` | `/metrics` | — | Prometheus-format metrics |
| `GET` | `/events` | — | SSE event stream |
| `OPTIONS` | `*` | — | CORS preflight |

### SSE Events

Connected clients receive typed events:

| Event Type | When |
|------------|------|
| `key_generated` | New key material created |
| `key_propagated` | Key stored in provider |
| `key_verified` | Propagation confirmed |
| `key_activated` | New key became active |
| `rotation_failed` | Rotation failed |

### Built-in Metrics

The sidecar automatically tracks:

| Metric | Type | Description |
|--------|------|-------------|
| `srk_rotate_requests_total` | Counter | Total rotation requests |
| `srk_rotate_failures_total` | Counter | Failed rotation requests |

## Usage Patterns

### Authenticated Access

```typescript
const server = new SidecarServer({
  manager,
  port: 8080,
  authToken: 'my-shared-secret',
});

// Write endpoints require: Authorization: Bearer my-shared-secret
```

### With SSE Event Streaming

```typescript
const server = new SidecarServer({
  manager,
  port: 8080,
  eventEmitter: manager.events, // expose rotation events as SSE
});

// Connect: curl -N http://localhost:8080/events
```

### Custom CORS

```typescript
const server = new SidecarServer({
  manager,
  port: 8080,
  corsOrigin: '*', // allow any origin
});
```

### Rotate via HTTP

```bash
curl -X POST http://localhost:8080/rotate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my-token" \
  -d '{"secretName": "database-password"}'
```

### Query Secret State

```bash
curl http://localhost:8080/secrets/database-password
```

### Scrape Metrics

```bash
curl http://localhost:8080/metrics
```

## Related Packages

- [`@reaatech/secret-rotation-core`](https://www.npmjs.com/package/@reaatech/secret-rotation-core) — Rotation engine
- [`@reaatech/secret-rotation-types`](https://www.npmjs.com/package/@reaatech/secret-rotation-types) — Shared types and interfaces
- [`@reaatech/secret-rotation-observability`](https://www.npmjs.com/package/@reaatech/secret-rotation-observability) — Logging and metrics

## License

[MIT](https://github.com/reaatech/secret-rotation-kit/blob/main/LICENSE)
