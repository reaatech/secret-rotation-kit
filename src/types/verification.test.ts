import { describe, expect, it } from "vitest";
import type {
	Consumer,
	ConsumerCapabilities,
	ConsumerVerificationResult,
	VerificationOptions,
	VerificationResult,
	VerificationStatus,
} from "./verification.js";

describe("Consumer", () => {
	it("can be constructed with required fields", () => {
		const consumer: Consumer = {
			id: "consumer-1",
			endpoint: "http://localhost:3000",
			interestedSecrets: ["db-password"],
			capabilities: {
				supportsVersionCheck: true,
				supportsHealthCheck: true,
				supportsCallback: false,
			},
		};

		expect(consumer.id).toBe("consumer-1");
	});

	it("accepts optional groups and auth", () => {
		const consumer: Consumer = {
			id: "consumer-2",
			endpoint: "http://localhost:3001",
			interestedSecrets: ["db-password", "api-key"],
			groups: ["backend", "production"],
			capabilities: {
				supportsVersionCheck: false,
				supportsHealthCheck: true,
				supportsCallback: false,
			},
			auth: {
				type: "bearer",
				credentials: { token: "secret-token" },
			},
		};

		expect(consumer.groups).toEqual(["backend", "production"]);
	});
});

describe("ConsumerCapabilities", () => {
	it("requires all capability flags", () => {
		const caps: ConsumerCapabilities = {
			supportsVersionCheck: false,
			supportsHealthCheck: false,
			supportsCallback: false,
		};

		expect(caps.supportsVersionCheck).toBe(false);
	});
});

describe("VerificationResult", () => {
	it("can represent a successful verification", () => {
		const result: VerificationResult = {
			success: true,
			consumerCount: 5,
			verifiedCount: 5,
			coverage: 1.0,
			duration: 1200,
			failures: [],
			canRetry: false,
		};

		expect(result.success).toBe(true);
		expect(result.coverage).toBe(1.0);
	});

	it("can represent a failed verification with partial coverage", () => {
		const result: VerificationResult = {
			success: false,
			consumerCount: 5,
			verifiedCount: 3,
			coverage: 0.6,
			duration: 5000,
			failures: [
				{ consumerId: "consumer-4", reason: "Timeout", canRetry: true },
				{ consumerId: "consumer-5", reason: "Unreachable", canRetry: false },
			],
			canRetry: true,
		};

		expect(result.success).toBe(false);
		expect(result.failures).toHaveLength(2);
	});
});

describe("ConsumerVerificationResult", () => {
	it("can represent a failed verification result", () => {
		const result: ConsumerVerificationResult = {
			consumerId: "consumer-1",
			success: false,
			error: "Connection refused",
			canRetry: true,
		};

		expect(result.canRetry).toBe(true);
	});
});

describe("VerificationOptions", () => {
	it("accepts partial options", () => {
		const options: VerificationOptions = {
			timeout: 30000,
			minConsumerCoverage: 0.95,
		};

		expect(options.timeout).toBe(30000);
		expect(options.perConsumerTimeout).toBeUndefined();
	});
});

describe("VerificationStatus", () => {
	it("tracks in-flight verification state", () => {
		const status: VerificationStatus = {
			state: "in_progress",
			progress: 0.5,
			checkedConsumers: ["consumer-1", "consumer-2"],
			failedConsumers: [],
			startedAt: new Date(),
		};

		expect(status.state).toBe("in_progress");
		expect(status.progress).toBe(0.5);
	});
});
