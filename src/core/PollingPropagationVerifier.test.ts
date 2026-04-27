import { describe, expect, it, vi } from "vitest";
import type { SecretProvider } from "../interfaces/index.js";
import type { RotationSession } from "../types/index.js";
import { PollingPropagationVerifier } from "./PollingPropagationVerifier.js";
import { TimeoutError } from "./errors.js";

function createMockProvider(
	responses: Array<{ value: string; versionId: string } | Error>,
): SecretProvider {
	let callIndex = 0;
	return {
		name: "mock",
		priority: 0,
		createSecret: vi.fn(),
		getSecret: vi.fn(async (_name, versionId) => {
			const response = responses[callIndex++];
			if (response instanceof Error) throw response;
			return { ...response, createdAt: new Date() };
		}),
		storeSecretValue: vi.fn(),
		deleteSecret: vi.fn(),
		listVersions: vi.fn(),
		getVersion: vi.fn(),
		deleteVersion: vi.fn(),
		supportsRotation: vi.fn(() => true),
		beginRotation: vi.fn(),
		completeRotation: vi.fn(),
		cancelRotation: vi.fn(),
		health: vi.fn(),
		capabilities: vi.fn(),
	};
}

function createSession(versionId: string): RotationSession {
	return {
		sessionId: "session-1",
		secretName: "test-secret",
		provider: "mock",
		state: { versionId },
		startedAt: new Date(),
	};
}

describe("PollingPropagationVerifier", () => {
	it("succeeds immediately when secret is readable", async () => {
		const provider = createMockProvider([{ value: "secret", versionId: "v2" }]);
		const verifier = new PollingPropagationVerifier(provider, 50);
		const session = createSession("v2");

		const result = await verifier.verify(session, { timeout: 1000 });

		expect(result.success).toBe(true);
		expect(result.coverage).toBe(1);
		expect(result.consumerCount).toBe(1);
		expect(result.verifiedCount).toBe(1);
		expect(result.failures).toEqual([]);
		expect(result.canRetry).toBe(false);
	});

	it("succeeds after retries when secret becomes readable", async () => {
		const provider = createMockProvider([
			new Error("not found"),
			new Error("not found"),
			{ value: "secret", versionId: "v2" },
		]);
		const verifier = new PollingPropagationVerifier(provider, 50);
		const session = createSession("v2");

		const result = await verifier.verify(session, { timeout: 1000 });

		expect(result.success).toBe(true);
		expect(provider.getSecret).toHaveBeenCalledTimes(3);
	});

	it("throws TimeoutError when secret never becomes readable", async () => {
		const provider = createMockProvider([new Error("not found")]);
		const verifier = new PollingPropagationVerifier(provider, 50);
		const session = createSession("v2");

		await expect(verifier.verify(session, { timeout: 150 })).rejects.toThrow(TimeoutError);
	});

	it("returns in_progress status while verifying", async () => {
		const provider = createMockProvider([
			new Error("not found"),
			new Error("not found"),
			new Error("not found"),
		]);
		const verifier = new PollingPropagationVerifier(provider, 50);
		const session = createSession("v2");

		// Start verification but don't await
		const verifyPromise = verifier.verify(session, { timeout: 500 });

		// Give it a moment to start
		await new Promise((r) => setTimeout(r, 60));

		const status = await verifier.getVerificationStatus(session);
		expect(status.state).toBe("in_progress");
		expect(status.progress).toBeGreaterThan(0);
		expect(status.progress).toBeLessThan(1);

		// Clean up by letting it timeout
		await expect(verifyPromise).rejects.toThrow();
	});

	it("returns completed status after verification finishes", async () => {
		const provider = createMockProvider([{ value: "secret", versionId: "v2" }]);
		const verifier = new PollingPropagationVerifier(provider, 50);
		const session = createSession("v2");

		await verifier.verify(session, { timeout: 1000 });

		const status = await verifier.getVerificationStatus(session);
		expect(status.state).toBe("completed");
		expect(status.progress).toBe(1);
	});

	it("rejects promptly when cancelled mid-poll", async () => {
		// Provider always fails so the verifier keeps polling until either timeout or cancel.
		const provider = createMockProvider(Array.from({ length: 100 }, () => new Error("not found")));
		const verifier = new PollingPropagationVerifier(provider, 1000);
		const session = createSession("v2");

		const start = Date.now();
		const verifyPromise = verifier.verify(session, { timeout: 30000 });
		await new Promise((r) => setTimeout(r, 30));
		await verifier.cancelVerification(session);

		await expect(verifyPromise).rejects.toThrow(/cancelled/i);
		// Cancellation should short-circuit well before the 30s timeout.
		expect(Date.now() - start).toBeLessThan(2000);
	});

	it("matches versionId for propagation confirmation", async () => {
		const provider = createMockProvider([{ value: "secret", versionId: "v2" }]);
		const verifier = new PollingPropagationVerifier(provider, 50);
		const session = createSession("v2");

		await verifier.verify(session, { timeout: 1000 });
		expect(provider.getSecret).toHaveBeenCalledWith("test-secret", "v2");
	});
});
