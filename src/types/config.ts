/**
 * Configuration types for the Secret Rotation Kit.
 */

import type { KeyFormat } from "./index.js";
import type { ProviderConfig } from "./provider.js";
import type { RetryPolicy } from "./verification.js";

/** Key generation settings. */
export interface KeyGenerationConfig {
	/** Encryption algorithm identifier. */
	algorithm: string;

	/** Key length in bits. */
	keyLength: number;

	/** Output format. */
	format: KeyFormat;
}

/** Rotation scheduling configuration. */
export interface SchedulingConfig {
	/** Whether automatic rotation is enabled. */
	enabled: boolean;

	/** Cron expression for scheduled rotation. */
	cron?: string;

	/** Interval in milliseconds (alternative to cron). */
	interval?: number;

	/** Timezone for cron expression. */
	timezone?: string;
}

/** Propagation verification configuration. */
export interface VerificationConfig {
	/** Verification strategy. */
	strategy: "active" | "passive" | "hybrid";

	/** Overall verification timeout in milliseconds. */
	timeout: number;

	/** Minimum consumer coverage ratio (0–1). */
	minConsumerCoverage: number;

	/** Timeout per consumer in milliseconds. */
	perConsumerTimeout: number;

	/** Retry policy for failed verifications. */
	retryPolicy: RetryPolicy;
}

/** Key validity window configuration. */
export interface KeyWindowConfig {
	/** How long both keys are valid during rotation, in milliseconds. */
	overlapPeriodMs: number;

	/** How long to keep old key after revocation, in milliseconds. */
	gracePeriodMs: number;

	/** Maximum number of concurrently valid keys per secret. */
	maxValidKeys?: number;
}

/** Event transport configuration. */
export interface EventTransportConfig {
	/** Transport type. */
	type: "webhook" | "sqs" | "pubsub" | "kafka";

	/** Transport-specific configuration. */
	config: Record<string, unknown>;
}

/** Event persistence configuration. */
export interface EventPersistenceConfig {
	/** Whether event persistence is enabled. */
	enabled: boolean;

	/** Maximum retention period in milliseconds. */
	retentionMs?: number;

	/** Persistence backend configuration. */
	backend?: Record<string, unknown>;
}

/** Event system configuration. */
export interface EventConfig {
	/** Whether event emission is enabled. */
	enabled: boolean;

	/** Active event transports. */
	transports: EventTransportConfig[];

	/** Event persistence settings. */
	persistence: EventPersistenceConfig;
}

/** Sidecar server configuration. */
export interface SidecarConfig {
	/** Whether the sidecar is enabled. */
	enabled: boolean;

	/** HTTP server port. */
	port: number;

	/** Whether to enable the gRPC server. */
	enableGRPC: boolean;
}

/** Logging configuration. */
export interface LoggingConfig {
	/** Minimum log level. */
	level: "debug" | "info" | "warn" | "error";

	/** Whether to use structured JSON logging. */
	structured: boolean;
}

/** Metrics configuration. */
export interface MetricsConfig {
	/** Whether metrics collection is enabled. */
	enabled: boolean;

	/** Metrics export format. */
	format: "prometheus" | "cloudwatch" | "datadog";
}

/** Distributed tracing configuration. */
export interface TracingConfig {
	/** Whether tracing is enabled. */
	enabled: boolean;

	/** Sampling rate (0–1). */
	samplingRate?: number;
}

/** Observability configuration. */
export interface ObservabilityConfig {
	/** Logging settings. */
	logging: LoggingConfig;

	/** Metrics settings. */
	metrics: MetricsConfig;

	/** Tracing settings. */
	tracing: TracingConfig;
}

/** Top-level rotation configuration. */
export interface RotationConfig {
	/** Provider configuration. */
	provider: ProviderConfig;

	/** Key generation settings. */
	keyGeneration: KeyGenerationConfig;

	/** Rotation scheduling. */
	scheduling: SchedulingConfig;

	/** Propagation verification. */
	verification: VerificationConfig;

	/** Key validity windows. */
	keyWindows: KeyWindowConfig;

	/** Event system. */
	events: EventConfig;

	/** Sidecar server. */
	sidecar: SidecarConfig;

	/** Observability. */
	observability: ObservabilityConfig;
}
