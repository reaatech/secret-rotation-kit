import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { describe, expect, it, vi } from "vitest";
import { AWSProvider } from "./AWSProvider.js";

// Mock AWS SDK
vi.mock("@aws-sdk/client-secrets-manager", async () => {
	const actual = await vi.importActual("@aws-sdk/client-secrets-manager");
	return {
		...actual,
		SecretsManagerClient: vi.fn().mockImplementation(() => ({
			send: vi.fn(),
		})),
	};
});

function createProvider(): { provider: AWSProvider; client: { send: ReturnType<typeof vi.fn> } } {
	const provider = new AWSProvider({ type: "aws", region: "us-east-1" });
	const client = (provider as unknown as { client: { send: ReturnType<typeof vi.fn> } }).client;
	return { provider, client };
}

describe("AWSProvider", () => {
	describe("createSecret", () => {
		it("creates a secret", async () => {
			const { provider, client } = createProvider();
			client.send.mockResolvedValueOnce({});

			await provider.createSecret("test-secret", "secret-value");

			expect(client.send).toHaveBeenCalledTimes(1);
			const command = client.send.mock.calls[0][0];
			expect(command.input.Name).toBe("test-secret");
			expect(command.input.SecretString).toBe("secret-value");
		});
	});

	describe("getSecret", () => {
		it("retrieves current version", async () => {
			const { provider, client } = createProvider();
			client.send.mockResolvedValueOnce({
				SecretString: "secret-value",
				VersionId: "v1",
				VersionStages: ["AWSCURRENT"],
				CreatedDate: new Date("2024-01-01"),
			});

			const result = await provider.getSecret("test-secret");

			expect(result.value).toBe("secret-value");
			expect(result.versionId).toBe("v1");
			expect(result.versionStages).toEqual(["AWSCURRENT"]);
		});

		it("retrieves specific version", async () => {
			const { provider, client } = createProvider();
			client.send.mockResolvedValueOnce({
				SecretString: "old-value",
				VersionId: "v0",
				VersionStages: ["AWSPREVIOUS"],
				CreatedDate: new Date("2024-01-01"),
			});

			const result = await provider.getSecret("test-secret", "v0");

			expect(result.value).toBe("old-value");
			expect(result.versionId).toBe("v0");
		});
	});

	describe("storeSecretValue", () => {
		it("stores a new version", async () => {
			const { provider, client } = createProvider();
			client.send.mockResolvedValueOnce({
				VersionId: "v2",
				VersionStages: ["AWSCURRENT"],
			});

			const result = await provider.storeSecretValue("test-secret", "new-value");

			expect(result.versionId).toBe("v2");
			expect(result.value).toBe("new-value");
		});
	});

	describe("deleteSecret", () => {
		it("deletes with recovery window", async () => {
			const { provider, client } = createProvider();
			client.send.mockResolvedValueOnce({});

			await provider.deleteSecret("test-secret");

			const command = client.send.mock.calls[0][0];
			expect(command.input.ForceDeleteWithoutRecovery).toBe(false);
		});

		it("force deletes when permanent is true", async () => {
			const { provider, client } = createProvider();
			client.send.mockResolvedValueOnce({});

			await provider.deleteSecret("test-secret", { permanent: true });

			const command = client.send.mock.calls[0][0];
			expect(command.input.ForceDeleteWithoutRecovery).toBe(true);
		});
	});

	describe("listVersions", () => {
		it("returns version list", async () => {
			const { provider, client } = createProvider();
			client.send.mockResolvedValueOnce({
				Versions: [
					{ VersionId: "v1", VersionStages: ["AWSCURRENT"], CreatedDate: new Date() },
					{ VersionId: "v2", VersionStages: ["AWSPENDING"], CreatedDate: new Date() },
				],
			});

			const versions = await provider.listVersions("test-secret");

			expect(versions).toHaveLength(2);
			expect(versions[0]?.versionId).toBe("v1");
		});

		it("handles versions without CreatedDate", async () => {
			const { provider, client } = createProvider();
			client.send.mockResolvedValueOnce({
				Versions: [{ VersionId: "v1", VersionStages: ["AWSCURRENT"] }],
			});

			const versions = await provider.listVersions("test-secret");

			expect(versions[0]?.createdAt).toBeInstanceOf(Date);
		});

		it("returns empty array when no versions", async () => {
			const { provider, client } = createProvider();
			client.send.mockResolvedValueOnce({});

			const versions = await provider.listVersions("test-secret");
			expect(versions).toEqual([]);
		});
	});

	describe("getVersion", () => {
		it("delegates to getSecret", async () => {
			const { provider, client } = createProvider();
			client.send.mockResolvedValueOnce({
				SecretString: "versioned-value",
				VersionId: "v3",
				VersionStages: ["AWSPREVIOUS"],
				CreatedDate: new Date("2024-01-01"),
			});

			const result = await provider.getVersion("test-secret", "v3");

			expect(result.value).toBe("versioned-value");
			expect(result.versionId).toBe("v3");
		});
	});

	describe("deleteVersion", () => {
		it("removes staging labels from version", async () => {
			const { provider, client } = createProvider();
			client.send
				.mockResolvedValueOnce({
					Versions: [{ VersionId: "v1", VersionStages: ["AWSCURRENT"], CreatedDate: new Date() }],
				})
				.mockResolvedValueOnce({});

			await provider.deleteVersion("test-secret", "v1");

			expect(client.send).toHaveBeenCalledTimes(2);
		});

		it("handles version without stages", async () => {
			const { provider, client } = createProvider();
			client.send.mockResolvedValueOnce({
				Versions: [{ VersionId: "v1", CreatedDate: new Date() }],
			});

			await provider.deleteVersion("test-secret", "v1");

			expect(client.send).toHaveBeenCalledTimes(1);
		});

		it("throws when version not found", async () => {
			const { provider, client } = createProvider();
			client.send.mockResolvedValueOnce({
				Versions: [{ VersionId: "v1", VersionStages: [], CreatedDate: new Date() }],
			});

			await expect(provider.deleteVersion("test-secret", "v2")).rejects.toThrow(
				"Version v2 not found",
			);
		});
	});

	describe("rotation", () => {
		it("begins rotation without making any API calls", async () => {
			const { provider, client } = createProvider();

			const session = await provider.beginRotation("test-secret");

			expect(session.provider).toBe("aws-secrets-manager");
			expect(session.secretName).toBe("test-secret");
			expect(session.sessionId).toMatch(/^aws-rot-/);
			expect(session.state.versionStages).toEqual(["AWSPENDING"]);
			expect(session.state.versionId).toBeUndefined();
			expect(client.send).not.toHaveBeenCalled();
		});

		it("storeSecretValue with stage:pending writes AWSPENDING", async () => {
			const { provider, client } = createProvider();
			client.send.mockResolvedValueOnce({
				VersionId: "v2",
				VersionStages: ["AWSPENDING"],
			});

			const result = await provider.storeSecretValue("test-secret", "new-value", {
				stage: "pending",
			});

			expect(result.versionId).toBe("v2");
			expect(client.send.mock.calls[0][0].input.VersionStages).toEqual(["AWSPENDING"]);
		});

		it("completes rotation by promoting to AWSCURRENT", async () => {
			const { provider, client } = createProvider();
			client.send.mockResolvedValueOnce({});

			await provider.completeRotation({
				sessionId: "v2",
				secretName: "test-secret",
				provider: "aws-secrets-manager",
				state: { versionId: "v2" },
				startedAt: new Date(),
			});

			const command = client.send.mock.calls[0][0];
			expect(command.input.VersionStage).toBe("AWSCURRENT");
			expect(command.input.MoveToVersionId).toBe("v2");
		});

		it("cancels rotation by removing AWSPENDING", async () => {
			const { provider, client } = createProvider();
			client.send.mockResolvedValueOnce({});

			await provider.cancelRotation({
				sessionId: "v2",
				secretName: "test-secret",
				provider: "aws-secrets-manager",
				state: { versionId: "v2" },
				startedAt: new Date(),
			});

			const command = client.send.mock.calls[0][0];
			expect(command.input.VersionStage).toBe("AWSPENDING");
			expect(command.input.RemoveFromVersionId).toBe("v2");
		});

		it("cancelRotation is a no-op when no versionId was assigned", async () => {
			const { provider, client } = createProvider();
			await provider.cancelRotation({
				sessionId: "aws-rot-x",
				secretName: "test-secret",
				provider: "aws-secrets-manager",
				state: {},
				startedAt: new Date(),
			});
			expect(client.send).not.toHaveBeenCalled();
		});

		it("completeRotation throws when session has no versionId", async () => {
			const { provider } = createProvider();
			await expect(
				provider.completeRotation({
					sessionId: "aws-rot-x",
					secretName: "test-secret",
					provider: "aws-secrets-manager",
					state: {},
					startedAt: new Date(),
				}),
			).rejects.toThrow("no versionId");
		});
	});

	describe("health", () => {
		it("returns healthy when API responds successfully", async () => {
			const { provider, client } = createProvider();
			client.send.mockResolvedValueOnce({});

			const health = await provider.health();

			expect(health.status).toBe("healthy");
		});

		it("returns healthy when API is accessible (not found error)", async () => {
			const { provider, client } = createProvider();
			client.send.mockRejectedValueOnce(
				Object.assign(new Error("Secret not found"), { name: "ResourceNotFoundException" }),
			);

			const health = await provider.health();

			expect(health.status).toBe("healthy");
		});

		it("returns unhealthy on connection errors", async () => {
			const { provider, client } = createProvider();
			client.send.mockRejectedValueOnce(new Error("Network error"));

			const health = await provider.health();

			expect(health.status).toBe("unhealthy");
		});

		it("returns unhealthy on non-Error rejection", async () => {
			const { provider, client } = createProvider();
			client.send.mockRejectedValueOnce("string-error");

			const health = await provider.health();

			expect(health.status).toBe("unhealthy");
		});
	});

	describe("capabilities", () => {
		it("advertises rotation and versioning support", () => {
			const provider = new AWSProvider({ type: "aws", region: "us-east-1" });
			const caps = provider.capabilities();

			expect(caps.supportsRotation).toBe(true);
			expect(caps.supportsVersioning).toBe(true);
			expect(caps.maxVersions).toBe(100);
		});
	});

	describe("supportsRotation", () => {
		it("returns true", () => {
			const provider = new AWSProvider({ type: "aws", region: "us-east-1" });
			expect(provider.supportsRotation()).toBe(true);
		});
	});
});
