import type { Logger } from "../interfaces/index.js";

/** Level weights for log filtering. */
const LEVEL_WEIGHT: Record<"debug" | "info" | "warn" | "error", number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

export interface LoggerOptions {
	/** Minimum log level. Defaults to "info". */
	level?: "debug" | "info" | "warn" | "error";
	/** If true, output newline-delimited JSON. Defaults to true. */
	structured?: boolean;
	/** Destination stream. Defaults to stderr. */
	stream?: NodeJS.WritableStream;
	/** Function that returns the current timestamp string. */
	getTimestamp?: () => string;
}

interface LogEntry {
	level: string;
	message: string;
	timestamp: string;
	meta?: Record<string, unknown>;
}

/**
 * Structured JSON logger implementing the Logger interface.
 *
 * Outputs newline-delimited JSON to stderr by default. Accepts both raw
 * strings and structured metadata.
 */
export class LoggerService implements Logger {
	private readonly minLevel: number;
	private readonly structured: boolean;
	private readonly stream: NodeJS.WritableStream;
	private readonly getTimestamp: () => string;

	constructor(options: LoggerOptions = {}) {
		this.minLevel = LEVEL_WEIGHT[options.level ?? "info"];
		this.structured = options.structured ?? true;
		this.stream = options.stream ?? process.stderr;
		this.getTimestamp = options.getTimestamp ?? (() => new Date().toISOString());
	}

	debug(message: string, meta?: Record<string, unknown>): void {
		this.log("debug", message, meta);
	}

	info(message: string, meta?: Record<string, unknown>): void {
		this.log("info", message, meta);
	}

	warn(message: string, meta?: Record<string, unknown>): void {
		this.log("warn", message, meta);
	}

	error(message: string, meta?: Record<string, unknown>): void {
		this.log("error", message, meta);
	}

	/**
	 * Create a child logger with default metadata merged into every log entry.
	 */
	child(defaults: Record<string, unknown>): Logger {
		return {
			debug: (msg, meta) => this.debug(msg, { ...defaults, ...meta }),
			info: (msg, meta) => this.info(msg, { ...defaults, ...meta }),
			warn: (msg, meta) => this.warn(msg, { ...defaults, ...meta }),
			error: (msg, meta) => this.error(msg, { ...defaults, ...meta }),
		};
	}

	private log(
		level: "debug" | "info" | "warn" | "error",
		message: string,
		meta?: Record<string, unknown>,
	): void {
		if (LEVEL_WEIGHT[level] < this.minLevel) return;

		const entry: LogEntry = {
			level,
			message,
			timestamp: this.getTimestamp(),
			...(meta !== undefined && Object.keys(meta).length > 0 && { meta }),
		};

		const line = this.structured
			? JSON.stringify(entry)
			: `${entry.timestamp} [${entry.level.toUpperCase()}] ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`;

		this.stream.write(`${line}\n`);
	}
}
