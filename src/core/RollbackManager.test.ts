import { describe, expect, it, vi } from "vitest";
import type { SecretProvider } from "../interfaces/index.js";
import type { SecretKey } from "../types/index.js";
import { InMemoryKeyStore } from "./InMemoryKeyStore.js";
import { RollbackManager } from "./RollbackManager.js";
import { RotationError } from "./errors.js";

function createMockProvider(): SecretProvider {
	return {
		name: "mock",
		priority: 1,
		createSecret: vi.fn(),
		getSecret: vi.fn(),
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
		capabilities: vi.fn(() => ({
			supportsRotation: true,
			supportsVersioning: true,
			supportsLabels: false,
		})),
	};
}

function createKey(secretName: string, keyId: string, status: SecretKey["status"]): SecretKey {
	return {
		keyId,
		secretName,
		encryptedMaterial: `material-${keyId}`,
		format: "base64",
		validFrom: new Date(),
		status,
		createdAt: new Date(),
	};
}

describe("RollbackManager", () => {
	it("starts and tracks a rotation entry", () => {
		const provider = createMockProvider();
		const store = new InMemoryKeyStore();
		const rm = new RollbackManager(provider, store, undefined, undefined);

		const entry = rm.startRotation("test-secret", "new-key-1", "active-key-1", null);
		expect(entry.secretName).toBe("test-secret");
		expect(entry.newKeyId).toBe("new-key-1");
		expect(entry.previousActiveKeyId).toBe("active-key-1");
		expect(entry.completed).toBe(false);
	});

	it("marks rotation entry as complete", () => {
		const provider = createMockProvider();
		const store = new InMemoryKeyStore();
		const rm = new RollbackManager(provider, store, undefined, undefined);

		const entry = rm.startRotation("test-secret", "new-key-1", null, null);
		rm.markComplete(entry.id);
		expect(rm.getEntry(entry.id)?.completed).toBe(true);
	});

	it("rolls back by marking new key failed", async () => {
		const provider = createMockProvider();
		const store = new InMemoryKeyStore();
		const newKey = createKey("test-secret", "new-key-1", "pending");
		await store.save(newKey);

		const rm = new RollbackManager(provider, store, undefined, undefined);
		const entry = rm.startRotation("test-secret", "new-key-1", null, null);

		const result = await rm.rollback(entry, "test failure");
		expect(result.success).toBe(true);

		const updated = await store.get("test-secret", "new-key-1");
		expect(updated?.status).toBe("failed");
	});

	it("cancels provider session during rollback", async () => {
		const provider = createMockProvider();
		provider.cancelRotation = vi.fn();
		const store = new InMemoryKeyStore();
		const newKey = createKey("test-secret", "new-key-1", "pending");
		await store.save(newKey);

		const session = {
			sessionId: "sess-1",
			secretName: "test-secret",
			provider: "mock",
			state: { versionId: "v1" },
			startedAt: new Date(),
		};

		const rm = new RollbackManager(provider, store, undefined, undefined);
		const entry = rm.startRotation("test-secret", "new-key-1", null, session);

		await rm.rollback(entry, "test failure");
		expect(provider.cancelRotation).toHaveBeenCalledWith(session);
	});

	it("reactivates previous active key on rollback", async () => {
		const provider = createMockProvider();
		const store = new InMemoryKeyStore();
		const prevKey = createKey("test-secret", "prev-key-1", "expired");
		await store.save(prevKey);

		const newKey = createKey("test-secret", "new-key-1", "pending");
		await store.save(newKey);

		const rm = new RollbackManager(provider, store, undefined, undefined);
		const entry = rm.startRotation("test-secret", "new-key-1", "prev-key-1", null);

		const result = await rm.rollback(entry, "test failure");
		expect(result.success).toBe(true);

		const reactivated = await store.get("test-secret", "prev-key-1");
		expect(reactivated?.status).toBe("active");
	});

	it("handles cancelRotation failure gracefully", async () => {
		const provider = createMockProvider();
		provider.cancelRotation = vi.fn(async () => {
			throw new Error("cancel failed");
		});
		const store = new InMemoryKeyStore();
		const newKey = createKey("test-secret", "new-key-1", "pending");
		await store.save(newKey);

		const session = {
			sessionId: "sess-1",
			secretName: "test-secret",
			provider: "mock",
			state: { versionId: "v1" },
			startedAt: new Date(),
		};

		const rm = new RollbackManager(provider, store, undefined, undefined);
		const entry = rm.startRotation("test-secret", "new-key-1", null, session);

		const result = await rm.rollback(entry, "test failure");
		expect(result.success).toBe(true);
	});

	it("handles markFailed on non-existent key gracefully", async () => {
		const provider = createMockProvider();
		const store = new InMemoryKeyStore();
		const rm = new RollbackManager(provider, store, undefined, undefined);
		const entry = rm.startRotation("test-secret", "nonexistent", null, null);

		const result = await rm.rollback(entry, "test failure");
		expect(result.success).toBe(true);
	});

	it("rollbackSimple creates and executes rollback", async () => {
		const provider = createMockProvider();
		const store = new InMemoryKeyStore();
		const newKey = createKey("test-secret", "new-key-1", "pending");
		await store.save(newKey);

		const rm = new RollbackManager(provider, store, undefined, undefined);
		const result = await rm.rollbackSimple("test-secret", "new-key-1", null, null, "error");
		expect(result.success).toBe(true);
	});

	it("enforces max entries limit", () => {
		const provider = createMockProvider();
		const store = new InMemoryKeyStore();
		const rm = new RollbackManager(provider, store, undefined, undefined, 2);

		rm.startRotation("test-secret", "k1", null, null);
		rm.startRotation("test-secret", "k2", null, null);
		rm.startRotation("test-secret", "k3", null, null);

		expect(rm.getEntries()).toHaveLength(2);
	});

	it("cannot reactivate a revoked key", async () => {
		const provider = createMockProvider();
		const store = new InMemoryKeyStore();
		const prevKey = createKey("test-secret", "prev-key-1", "revoked");
		await store.save(prevKey);

		const newKey = createKey("test-secret", "new-key-1", "pending");
		await store.save(newKey);

		const rm = new RollbackManager(provider, store, undefined, undefined);
		const entry = rm.startRotation("test-secret", "new-key-1", "prev-key-1", null);

		await rm.rollback(entry, "test failure");
		const key = await store.get("test-secret", "prev-key-1");
		expect(key?.status).toBe("revoked");
	});

	it("handles reactivation of failed key", async () => {
		const provider = createMockProvider();
		const store = new InMemoryKeyStore();
		const prevKey = createKey("test-secret", "prev-key-1", "failed");
		await store.save(prevKey);

		const newKey = createKey("test-secret", "new-key-1", "pending");
		await store.save(newKey);

		const rm = new RollbackManager(provider, store, undefined, undefined);
		const entry = rm.startRotation("test-secret", "new-key-1", "prev-key-1", null);

		await rm.rollback(entry, "test failure");
		const key = await store.get("test-secret", "prev-key-1");
		expect(key?.status).toBe("failed");
	});

	it("handles reactivation of non-existent previous key", async () => {
		const provider = createMockProvider();
		const store = new InMemoryKeyStore();
		const newKey = createKey("test-secret", "new-key-1", "pending");
		await store.save(newKey);

		const rm = new RollbackManager(provider, store, undefined, undefined);
		const entry = rm.startRotation("test-secret", "new-key-1", "missing-key", null);

		const result = await rm.rollback(entry, "test failure");
		expect(result.success).toBe(false);
	});

	it("handles event emitter for rollback entries", () => {
		const provider = createMockProvider();
		const store = new InMemoryKeyStore();
		const rm = new RollbackManager(provider, store, undefined, undefined);

		const e1 = rm.startRotation("s1", "k1", null, null);
		const e2 = rm.startRotation("s2", "k2", null, null);
		expect(rm.getEntries()).toHaveLength(2);

		const found = rm.getEntry(e1.id);
		expect(found?.secretName).toBe("s1");
		expect(rm.getEntry("not-found")).toBeUndefined();
	});
});
