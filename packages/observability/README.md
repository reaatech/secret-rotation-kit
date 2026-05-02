# @reaatech/secret-rotation-observability

[![npm version](https://img.shields.io/npm/v/@reaatech/secret-rotation-observability.svg)](https://www.npmjs.com/package/@reaatech/secret-rotation-observability)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/secret-rotation-kit/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/secret-rotation-kit/ci.yml?branch=main&label=CI)](https://github.com/reaatech/secret-rotation-kit/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Structured JSON logging and Prometheus-format metrics for [Secret Rotation Kit](https://github.com/reaatech/secret-rotation-kit). Provides a minimal, zero-dependency observability layer suitable for library and sidecar usage.

## Installation

```bash
npm install @reaatech/secret-rotation-observability
# or
pnpm add @reaatech/secret-rotation-observability
```

## Feature Overview

- **Structured JSON logging** — newline-delimited JSON to stderr with level filtering
- **Prometheus metrics** — `Counter`, `Gauge`, `Histogram`, `Summary` with labeled output
- **Level filtering** — `debug`, `info`, `warn`, `error`
- **Child loggers** — create loggers with pre-set metadata for component isolation
- **Zero runtime dependencies** — no external logging or metrics libraries
- **Collectable output** — `collect()` produces Prometheus text format ready for scraping

## Quick Start

```typescript
import { LoggerService, MetricsService, Counter } from '@reaatech/secret-rotation-observability';

const logger = new LoggerService({ level: 'info' });
logger.info('Server started', { port: 8080 });

const metrics = new MetricsService();
const requests = metrics.counter('http_requests_total', 'Total HTTP requests');
requests.inc();

console.log(metrics.collect());
// # HELP http_requests_total Total HTTP requests
// # TYPE http_requests_total counter
// http_requests_total 1
```

## API Reference

### `LoggerService`

Implements the `Logger` interface from `@reaatech/secret-rotation-types`.

#### Constructor

```typescript
new LoggerService(options?: LoggerServiceOptions)
```

#### `LoggerServiceOptions`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `level` | `string` | `"info"` | Minimum log level: `"debug"`, `"info"`, `"warn"`, `"error"` |
| `stream` | `WritableStream` | `process.stderr` | Output stream |
| `metadata` | `Record<string, unknown>` | — | Default metadata on every log entry |

#### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `debug` | `(message: string, meta?: Record<string, unknown>)` | Debug-level message |
| `info` | `(message: string, meta?: Record<string, unknown>)` | Info-level message |
| `warn` | `(message: string, meta?: Record<string, unknown>)` | Warning-level message |
| `error` | `(message: string, meta?: Record<string, unknown>)` | Error-level message |
| `child` | `(meta: Record<string, unknown>): LoggerService` | Create a child logger with merged metadata |

#### Output Format

Each log call produces a single JSON line:

```json
{"level":"info","message":"Server started","port":8080,"timestamp":"2026-01-01T00:00:00.000Z"}
```

### `MetricsService`

Prometheus-format metric registry.

#### Constructor

```typescript
new MetricsService(logger?: Logger)
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `logger` | `Logger` | — | Optional logger for metric collection errors |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `counter(name, help, labels?)` | `Counter` | Create or retrieve a counter |
| `gauge(name, help, labels?)` | `Gauge` | Create or retrieve a gauge |
| `histogram(name, help, labels?, buckets?)` | `Histogram` | Create or retrieve a histogram |
| `summary(name, help, labels?, quantiles?)` | `Summary` | Create or retrieve a summary |
| `collect()` | `string` | Collect all metrics in Prometheus text format |

### Metric Types

#### `Counter`

Monotonically increasing value. Use for request counts, error counts, rotation counts.

```typescript
const counter = metrics.counter('rotations_total', 'Total rotation count');
counter.inc();      // +1
counter.inc(5);     // +5
```

#### `Gauge`

Arbitrary up/down value. Use for in-progress counts, queue depth, coverage ratios.

```typescript
const gauge = metrics.gauge('active_rotations', 'In-progress rotations');
gauge.inc(1);
gauge.dec(1);
gauge.set(0);
```

#### `Histogram`

Value distribution with configurable buckets. Use for duration measurements.

```typescript
const histogram = metrics.histogram(
  'rotation_duration_seconds',
  'Rotation duration',
  ['provider'],
  [0.1, 0.5, 1, 5, 10, 30, 60],
);
histogram.observe(2.3, { provider: 'aws' });
```

#### `Summary`

Value distribution with configurable quantiles. Use for latency percentiles.

```typescript
const summary = metrics.summary('verification_latency_ms', 'Verification latency', ['strategy']);
summary.observe(150, { strategy: 'polling' });
```

All metric types support labeled variants. Labels are passed as an object to the constructor and observe/inc/dec methods.

## Usage Patterns

### Component-level Logging

```typescript
import { LoggerService } from '@reaatech/secret-rotation-observability';

const baseLogger = new LoggerService({ level: 'debug' });
const rotationLogger = baseLogger.child({ component: 'rotation' });
const providerLogger = baseLogger.child({ component: 'provider', provider: 'aws' });

rotationLogger.info('Starting rotation', { secret: 'db-password' });
// {"level":"info","message":"Starting rotation","component":"rotation","secret":"db-password","timestamp":"..."}
```

### Built-in Metrics for Rotation

```typescript
const metrics = new MetricsService();
metrics.counter('srk_rotate_requests_total', 'Total rotation requests');
metrics.counter('srk_rotate_failures_total', 'Failed rotation requests');
metrics.gauge('srk_rotation_in_progress', 'Currently running rotations');
metrics.histogram('srk_rotation_duration_ms', 'Rotation duration in milliseconds');
```

## Related Packages

- [`@reaatech/secret-rotation-types`](https://www.npmjs.com/package/@reaatech/secret-rotation-types) — Shared types and the `Logger` interface
- [`@reaatech/secret-rotation-core`](https://www.npmjs.com/package/@reaatech/secret-rotation-core) — Rotation engine
- [`@reaatech/secret-rotation-sidecar`](https://www.npmjs.com/package/@reaatech/secret-rotation-sidecar) — HTTP sidecar (exposes `/metrics` endpoint)

## License

[MIT](https://github.com/reaatech/secret-rotation-kit/blob/main/LICENSE)
