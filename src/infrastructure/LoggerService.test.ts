import { describe, expect, it, vi } from "vitest";
import { LoggerService } from "./LoggerService.js";

describe("LoggerService", () => {
	it("writes info log when level is info", () => {
		const stream = { write: vi.fn() };
		const logger = new LoggerService({
			level: "info",
			structured: true,
			stream: stream as unknown as NodeJS.WritableStream,
		});

		logger.info("test message", { key: "value" });
		expect(stream.write).toHaveBeenCalledTimes(1);
		const output = JSON.parse(stream.write.mock.calls[0][0] as string);
		expect(output.level).toBe("info");
		expect(output.message).toBe("test message");
		expect(output.meta.key).toBe("value");
	});

	it("suppresses debug when level is info", () => {
		const stream = { write: vi.fn() };
		const logger = new LoggerService({
			level: "info",
			stream: stream as unknown as NodeJS.WritableStream,
		});

		logger.debug("debug message");
		expect(stream.write).not.toHaveBeenCalled();
	});

	it("outputs all levels when level is debug", () => {
		const stream = { write: vi.fn() };
		const logger = new LoggerService({
			level: "debug",
			stream: stream as unknown as NodeJS.WritableStream,
		});

		logger.debug("debug");
		logger.info("info");
		logger.warn("warn");
		logger.error("error");
		expect(stream.write).toHaveBeenCalledTimes(4);
	});

	it("outputs unstructured log when structured is false", () => {
		const stream = { write: vi.fn() };
		const logger = new LoggerService({
			level: "info",
			structured: false,
			stream: stream as unknown as NodeJS.WritableStream,
		});

		logger.info("hello");
		const output = stream.write.mock.calls[0][0] as string;
		expect(output).not.toContain("{");
		expect(output).toContain("hello");
	});

	it("creates child logger with default metadata", () => {
		const stream = { write: vi.fn() };
		const logger = new LoggerService({
			level: "info",
			stream: stream as unknown as NodeJS.WritableStream,
		});
		const child = logger.child({ service: "rotation" });

		child.info("test");
		const output = JSON.parse(stream.write.mock.calls[0][0] as string);
		expect(output.meta.service).toBe("rotation");
	});

	it("merges child and call-site metadata", () => {
		const stream = { write: vi.fn() };
		const logger = new LoggerService({
			level: "info",
			stream: stream as unknown as NodeJS.WritableStream,
		});
		const child = logger.child({ service: "rotation" });

		child.info("test", { key: "extra" });
		const output = JSON.parse(stream.write.mock.calls[0][0] as string);
		expect(output.meta.service).toBe("rotation");
		expect(output.meta.key).toBe("extra");
	});

	it("omits meta field when meta is undefined", () => {
		const stream = { write: vi.fn() };
		const logger = new LoggerService({
			level: "info",
			stream: stream as unknown as NodeJS.WritableStream,
		});

		logger.info("no meta");
		const output = JSON.parse(stream.write.mock.calls[0][0] as string);
		expect(output.meta).toBeUndefined();
	});

	it("uses custom timestamp function", () => {
		const stream = { write: vi.fn() };
		const logger = new LoggerService({
			level: "info",
			stream: stream as unknown as NodeJS.WritableStream,
			getTimestamp: () => "2024-01-01T00:00:00.000Z",
		});

		logger.info("test");
		const output = JSON.parse(stream.write.mock.calls[0][0] as string);
		expect(output.timestamp).toBe("2024-01-01T00:00:00.000Z");
	});

	it("suppresses warn when level is error", () => {
		const stream = { write: vi.fn() };
		const logger = new LoggerService({
			level: "error",
			stream: stream as unknown as NodeJS.WritableStream,
		});

		logger.warn("should not appear");
		logger.debug("should not appear");
		logger.info("should not appear");
		expect(stream.write).not.toHaveBeenCalled();

		logger.error("should appear");
		expect(stream.write).toHaveBeenCalledTimes(1);
	});

	it("child logger respects level of parent", () => {
		const stream = { write: vi.fn() };
		const logger = new LoggerService({
			level: "error",
			stream: stream as unknown as NodeJS.WritableStream,
		});
		const child = logger.child({ service: "x" });

		child.info("suppressed");
		expect(stream.write).not.toHaveBeenCalled();

		child.error("shown");
		expect(stream.write).toHaveBeenCalledTimes(1);
	});
});
