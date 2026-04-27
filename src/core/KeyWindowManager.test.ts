import { describe, expect, it } from "vitest";
import { InMemoryKeyStore } from "./InMemoryKeyStore.js";
import { KeyWindowManager } from "./KeyWindowManager.js";

function createPendingKey(secretName: string, keyId: string, createdAt?: Date) {
	return {
		keyId,
		secretName,
		encryptedMaterial: `material-${keyId}`,
		format: "base64" as const,
		validFrom: createdAt ?? new Date(),
		status: "pending" as const,
		createdAt: createdAt ?? new Date(),
	};
}

describe("KeyWindowManager", () => {
	describe("activate", () => {
		it("activates a pending key", async () => {
			const store = new InMemoryKeyStore();
			const manager = new KeyWindowManager(store);
			const key = createPendingKey("test-secret", "k1");
			await store.save(key);

			const activated = await manager.activate("test-secret", "k1");
			expect(activated.status).toBe("active");
			expect(activated.rotatedAt).toBeInstanceOf(Date);
		});

		it("expires previous active key with overlap window", async () => {
			const store = new InMemoryKeyStore();
			const manager = new KeyWindowManager(store, { overlapPeriodMs: 5000 });

			const key1 = createPendingKey("test-secret", "k1", new Date(Date.now() - 60000));
			await store.save(key1);
			await manager.activate("test-secret", "k1");

			const key2 = createPendingKey("test-secret", "k2", new Date());
			await store.save(key2);
			await manager.activate("test-secret", "k2");

			const prev = await store.get("test-secret", "k1");
			expect(prev?.status).toBe("expired");
			expect(prev?.validUntil).toBeInstanceOf(Date);
		});

		it("throws when key not found", async () => {
			const store = new InMemoryKeyStore();
			const manager = new KeyWindowManager(store);

			await expect(manager.activate("test-secret", "missing")).rejects.toThrow("Key not found");
		});

		it("enforces max valid keys by revoking oldest expired", async () => {
			const store = new InMemoryKeyStore();
			const manager = new KeyWindowManager(store, { maxValidKeys: 1 });

			const k1 = {
				...createPendingKey("test-secret", "k1", new Date(Date.now() - 10000)),
				status: "expired" as const,
				validUntil: new Date(Date.now() - 5000),
			};
			await store.save(k1);
			const k2 = {
				...createPendingKey("test-secret", "k2", new Date(Date.now() - 5000)),
				status: "active" as const,
			};
			await store.save(k2);

			const k3 = createPendingKey("test-secret", "k3", new Date());
			await store.save(k3);
			await manager.activate("test-secret", "k3");

			const old = await store.get("test-secret", "k1");
			expect(old?.status).toBe("revoked");
		});

		it("enforces max keys with no expired keys (nothing revoked)", async () => {
			const store = new InMemoryKeyStore();
			const manager = new KeyWindowManager(store, { maxValidKeys: 3 });

			const k1 = { ...createPendingKey("test-secret", "k1"), status: "active" as const };
			await store.save(k1);

			const k2 = createPendingKey("test-secret", "k2");
			await store.save(k2);
			await manager.activate("test-secret", "k2");

			expect((await store.get("test-secret", "k1"))?.status).toBe("expired");
			expect((await store.get("test-secret", "k2"))?.status).toBe("active");
		});
	});

	describe("selectKey", () => {
		it("returns null when no valid keys exist", async () => {
			const store = new InMemoryKeyStore();
			const manager = new KeyWindowManager(store);
			const result = await manager.selectKey("test-secret");
			expect(result).toBeNull();
		});

		it("prefers active key over expired", async () => {
			const store = new InMemoryKeyStore();
			const manager = new KeyWindowManager(store);

			const active = { ...createPendingKey("test-secret", "k1"), status: "active" as const };
			await store.save(active);
			const expired = {
				...createPendingKey("test-secret", "k2", new Date(Date.now() - 10000)),
				status: "expired" as const,
				validUntil: new Date(Date.now() + 10000),
			};
			await store.save(expired);

			const result = await manager.selectKey("test-secret");
			expect(result?.keyId).toBe("k1");
		});

		it("falls back to expired when no active", async () => {
			const store = new InMemoryKeyStore();
			const manager = new KeyWindowManager(store);

			const expired = {
				...createPendingKey("test-secret", "k1", new Date(Date.now() - 10000)),
				status: "expired" as const,
				validUntil: new Date(Date.now() + 10000),
			};
			await store.save(expired);

			const result = await manager.selectKey("test-secret");
			expect(result?.keyId).toBe("k1");
		});
	});

	describe("cleanupExpired", () => {
		it("revokes keys past grace period", async () => {
			const store = new InMemoryKeyStore();
			const manager = new KeyWindowManager(store, { gracePeriodMs: 0 });

			const key = {
				...createPendingKey("test-secret", "k1", new Date(Date.now() - 100000)),
				status: "expired" as const,
				validUntil: new Date(Date.now() - 60000),
			};
			await store.save(key);

			const revoked = await manager.cleanupExpired("test-secret");
			expect(revoked).toContain("k1");
			const updated = await store.get("test-secret", "k1");
			expect(updated?.status).toBe("revoked");
		});

		it("does not revoke keys still in grace period", async () => {
			const store = new InMemoryKeyStore();
			const manager = new KeyWindowManager(store, { gracePeriodMs: 60000 });

			const key = {
				...createPendingKey("test-secret", "k1"),
				status: "expired" as const,
				validUntil: new Date(Date.now() + 30000),
			};
			await store.save(key);

			const revoked = await manager.cleanupExpired("test-secret");
			expect(revoked).toHaveLength(0);
		});
	});

	describe("getConfig", () => {
		it("returns current window config", () => {
			const store = new InMemoryKeyStore();
			const manager = new KeyWindowManager(store, { overlapPeriodMs: 10000, gracePeriodMs: 5000 });
			const config = manager.getConfig();
			expect(config.overlapPeriodMs).toBe(10000);
			expect(config.gracePeriodMs).toBe(5000);
		});
	});
});
