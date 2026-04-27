import { describe, expect, it } from "vitest";
import type {
	KeyActivatedEvent,
	KeyFormat,
	KeyGeneratedEvent,
	KeyPropagatedEvent,
	KeyRevokedEvent,
	KeyStatus,
	KeyVerifiedEvent,
	RotationEvent,
	RotationFailedEvent,
	RotationStage,
	RotationState,
	SecretKey,
} from "./index.js";

describe("KeyStatus", () => {
	it("accepts all valid statuses", () => {
		const statuses: KeyStatus[] = ["pending", "active", "expired", "revoked", "failed"];
		expect(statuses).toHaveLength(5);
	});
});

describe("KeyFormat", () => {
	it("accepts all valid formats", () => {
		const formats: KeyFormat[] = ["base64", "hex", "pem", "raw"];
		expect(formats).toHaveLength(4);
	});
});

describe("RotationStage", () => {
	it("accepts all valid stages", () => {
		const stages: RotationStage[] = [
			"generation",
			"propagation",
			"verification",
			"activation",
			"revocation",
		];
		expect(stages).toHaveLength(5);
	});
});

describe("SecretKey", () => {
	it("can be constructed with required fields", () => {
		const key: SecretKey = {
			keyId: "key-001",
			secretName: "test-secret",
			encryptedMaterial: "abc123",
			format: "base64",
			validFrom: new Date(),
			status: "active",
			createdAt: new Date(),
		};

		expect(key.keyId).toBe("key-001");
		expect(key.status).toBe("active");
	});

	it("accepts optional fields", () => {
		const key: SecretKey = {
			keyId: "key-002",
			secretName: "test-secret",
			encryptedMaterial: "def456",
			format: "hex",
			validFrom: new Date("2024-01-01"),
			validUntil: new Date("2025-01-01"),
			status: "expired",
			createdAt: new Date("2024-01-01"),
			rotatedAt: new Date("2024-06-01"),
			revokedAt: new Date("2025-01-02"),
			metadata: { source: "test" },
		};

		expect(key.validUntil).toBeInstanceOf(Date);
		expect(key.metadata).toEqual({ source: "test" });
	});
});

describe("RotationState", () => {
	it("can represent an empty rotation state", () => {
		const state: RotationState = {
			secretName: "test-secret",
			activeKey: null,
			pendingKeys: [],
			expiredKeys: [],
			revokedKeys: [],
			rotationCount: 0,
		};

		expect(state.activeKey).toBeNull();
		expect(state.rotationCount).toBe(0);
	});
});

describe("RotationEvent union", () => {
	it("accepts KeyGeneratedEvent", () => {
		const event: RotationEvent = {
			type: "key_generated",
			secretName: "test-secret",
			keyId: "key-001",
			timestamp: new Date(),
		};

		expect(event.type).toBe("key_generated");
	});

	it("accepts KeyPropagatedEvent", () => {
		const event: RotationEvent = {
			type: "key_propagated",
			secretName: "test-secret",
			keyId: "key-001",
			provider: "aws-secrets-manager",
			timestamp: new Date(),
			propagationTime: 150,
		};

		expect(event.type).toBe("key_propagated");
	});

	it("accepts KeyVerifiedEvent", () => {
		const event: RotationEvent = {
			type: "key_verified",
			secretName: "test-secret",
			keyId: "key-001",
			consumerCount: 5,
			verificationTime: 2300,
			timestamp: new Date(),
		};

		expect(event.type).toBe("key_verified");
	});

	it("accepts KeyActivatedEvent", () => {
		const event: KeyActivatedEvent = {
			type: "key_activated",
			secretName: "test-secret",
			keyId: "key-002",
			previousKeyId: "key-001",
			timestamp: new Date(),
		};

		expect(event.previousKeyId).toBe("key-001");
	});

	it("accepts KeyRevokedEvent", () => {
		const event: KeyRevokedEvent = {
			type: "key_revoked",
			secretName: "test-secret",
			keyId: "key-001",
			reason: "Rotation complete",
			timestamp: new Date(),
		};

		expect(event.reason).toBe("Rotation complete");
	});

	it("accepts RotationFailedEvent", () => {
		const event: RotationFailedEvent = {
			type: "rotation_failed",
			secretName: "test-secret",
			keyId: "key-001",
			error: "Provider timeout",
			stage: "propagation",
			timestamp: new Date(),
			canRetry: true,
		};

		expect(event.canRetry).toBe(true);
	});
});
