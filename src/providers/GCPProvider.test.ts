import { describe, expect, it, vi } from "vitest";
import { GCPProvider } from "./GCPProvider.js";

// Mock GCP SDK
vi.mock("@google-cloud/secret-manager", async () => {
	return {
		SecretManagerServiceClient: vi.fn().mockImplementation(() => ({
			createSecret: vi.fn(),
			getSecret: vi.fn(),
			addSecretVersion: vi.fn(),
			accessSecretVersion: vi.fn(),
			deleteSecret: vi.fn(),
			listSecretVersions: vi.fn(),
			updateSecret: vi.fn(),
			destroySecretVersion: vi.fn(),
			listSecrets: vi.fn(),
		})),
	};
});

function createProvider(): {
	provider: GCPProvider;
	client: Record<string, ReturnType<typeof vi.fn>>;
} {
	const provider = new GCPProvider({ type: "gcp", projectId: "test-project" });
	const client = (provider as unknown as { client: Record<string, ReturnType<typeof vi.fn>> })
		.client;
	return { provider, client };
}

describe("GCPProvider", () => {
	describe("createSecret", () => {
		it("creates secret and adds initial version", async () => {
			const { provider, client } = createProvider();
			client.createSecret.mockResolvedValueOnce([
				{ name: "projects/test-project/secrets/test-secret" },
			]);
			client.addSecretVersion.mockResolvedValueOnce([{}]);

			await provider.createSecret("test-secret", "secret-value");

			expect(client.createSecret).toHaveBeenCalledTimes(1);
			expect(client.addSecretVersion).toHaveBeenCalledTimes(1);
		});
	});

	describe("getSecret", () => {
		it("retrieves latest version by default", async () => {
			const { provider, client } = createProvider();
			client.accessSecretVersion.mockResolvedValueOnce([
				{
					payload: { data: Buffer.from("secret-value", "utf-8") },
					name: "projects/test-project/secrets/test-secret/versions/1",
					createTime: { seconds: "1700000000", nanos: 0 },
				},
			]);

			const result = await provider.getSecret("test-secret");

			expect(result.value).toBe("secret-value");
			expect(result.versionId).toContain("versions/1");
		});

		it("returns empty value when payload is missing", async () => {
			const { provider, client } = createProvider();
			client.accessSecretVersion.mockResolvedValueOnce([{}]);

			const result = await provider.getSecret("test-secret");

			expect(result.value).toBe("");
		});

		it("retrieves specific version when provided", async () => {
			const { provider, client } = createProvider();
			client.accessSecretVersion.mockResolvedValueOnce([
				{
					payload: { data: Buffer.from("old-value", "utf-8") },
					name: "projects/test-project/secrets/test-secret/versions/1",
					createTime: { seconds: "1700000000", nanos: 0 },
				},
			]);

			const result = await provider.getSecret("test-secret", "1");

			const call = client.accessSecretVersion.mock.calls[0][0];
			expect(call.name).toContain("versions/1");
			expect(result.value).toBe("old-value");
		});
	});

	describe("storeSecretValue", () => {
		it("adds a new version", async () => {
			const { provider, client } = createProvider();
			client.addSecretVersion.mockResolvedValueOnce([
				{
					name: "projects/test-project/secrets/test-secret/versions/2",
					createTime: { seconds: "1700000000", nanos: 0 },
				},
			]);

			const result = await provider.storeSecretValue("test-secret", "new-value");

			expect(result.versionId).toContain("versions/2");
			expect(result.value).toBe("new-value");
		});
	});

	describe("deleteSecret", () => {
		it("deletes a secret", async () => {
			const { provider, client } = createProvider();
			client.deleteSecret.mockResolvedValueOnce([{}]);

			await provider.deleteSecret("test-secret");

			expect(client.deleteSecret).toHaveBeenCalledTimes(1);
		});
	});

	describe("listVersions", () => {
		it("returns version list", async () => {
			const { provider, client } = createProvider();
			client.listSecretVersions.mockResolvedValueOnce([
				[
					{
						name: "projects/test-project/secrets/test-secret/versions/1",
						createTime: { seconds: "1700000000", nanos: 0 },
						state: "ENABLED",
					},
					{
						name: "projects/test-project/secrets/test-secret/versions/2",
						createTime: { seconds: "1700000001", nanos: 0 },
						state: "ENABLED",
					},
				],
			]);

			const versions = await provider.listVersions("test-secret");

			expect(versions).toHaveLength(2);
			expect(versions[0]?.versionId).toContain("versions/1");
		});

		it("handles versions without state", async () => {
			const { provider, client } = createProvider();
			client.listSecretVersions.mockResolvedValueOnce([
				[
					{
						name: "projects/test-project/secrets/test-secret/versions/1",
						createTime: { seconds: "1700000000", nanos: 0 },
					},
				],
			]);

			const versions = await provider.listVersions("test-secret");

			expect(versions).toHaveLength(1);
			expect(versions[0]?.stages).toBeUndefined();
		});

		it("handles versions without createTime", async () => {
			const { provider, client } = createProvider();
			client.listSecretVersions.mockResolvedValueOnce([
				[
					{
						name: "projects/test-project/secrets/test-secret/versions/1",
						state: "ENABLED",
					},
				],
			]);

			const versions = await provider.listVersions("test-secret");

			expect(versions).toHaveLength(1);
			expect(versions[0]?.createdAt).toBeInstanceOf(Date);
		});
	});

	describe("getVersion", () => {
		it("retrieves by numeric versionId", async () => {
			const { provider, client } = createProvider();
			client.accessSecretVersion.mockResolvedValueOnce([
				{
					payload: { data: Buffer.from("versioned-value", "utf-8") },
					name: "projects/test-project/secrets/test-secret/versions/3",
				},
			]);

			const result = await provider.getVersion("test-secret", "3");

			expect(result.value).toBe("versioned-value");
			expect(result.versionId).toContain("versions/3");
		});

		it("retrieves by full path versionId", async () => {
			const { provider, client } = createProvider();
			client.accessSecretVersion.mockResolvedValueOnce([
				{
					payload: { data: Buffer.from("full-path-value", "utf-8") },
					name: "projects/test-project/secrets/test-secret/versions/5",
				},
			]);

			const result = await provider.getVersion(
				"test-secret",
				"projects/test-project/secrets/test-secret/versions/5",
			);

			expect(result.value).toBe("full-path-value");
		});
	});

	describe("deleteVersion", () => {
		it("destroys a version by number", async () => {
			const { provider, client } = createProvider();
			client.destroySecretVersion.mockResolvedValueOnce([{}]);

			await provider.deleteVersion("test-secret", "1");

			expect(client.destroySecretVersion).toHaveBeenCalledTimes(1);
		});

		it("destroys a version by full path", async () => {
			const { provider, client } = createProvider();
			client.destroySecretVersion.mockResolvedValueOnce([{}]);

			await provider.deleteVersion(
				"test-secret",
				"projects/test-project/secrets/test-secret/versions/1",
			);

			const call = client.destroySecretVersion.mock.calls[0][0];
			expect(call.name).toBe("projects/test-project/secrets/test-secret/versions/1");
		});
	});

	describe("rotation", () => {
		it("begins rotation and sets labels", async () => {
			const { provider, client } = createProvider();
			client.addSecretVersion.mockResolvedValueOnce([
				{
					name: "projects/test-project/secrets/test-secret/versions/2",
					createTime: { seconds: "1700000000", nanos: 0 },
				},
			]);
			client.updateSecret.mockResolvedValueOnce([{}]);

			const session = await provider.beginRotation("test-secret");

			expect(session.provider).toBe("gcp-secret-manager");
			expect(client.updateSecret).toHaveBeenCalledTimes(1);
			const updateCall = client.updateSecret.mock.calls[0][0];
			expect(updateCall.secret.labels["rotation-status"]).toBe("pending");
		});

		it("completes rotation by clearing labels", async () => {
			const { provider, client } = createProvider();
			client.getSecret.mockResolvedValueOnce([
				{ labels: { "rotation-status": "pending", env: "prod" } },
			]);
			client.updateSecret.mockResolvedValueOnce([{}]);

			await provider.completeRotation({
				sessionId: "v2",
				secretName: "test-secret",
				provider: "gcp-secret-manager",
				state: { versionId: "v2", metadata: { status: "pending" } },
				startedAt: new Date(),
			});

			const updateCall = client.updateSecret.mock.calls[0][0];
			expect(updateCall.secret.labels).toEqual({ env: "prod" });
			expect("rotation-status" in updateCall.secret.labels).toBe(false);
		});

		it("cancels rotation by destroying version and clearing labels", async () => {
			const { provider, client } = createProvider();
			client.destroySecretVersion.mockResolvedValueOnce([{}]);
			client.getSecret.mockResolvedValueOnce([{ labels: {} }]);
			client.updateSecret.mockResolvedValueOnce([{}]);

			await provider.cancelRotation({
				sessionId: "v2",
				secretName: "test-secret",
				provider: "gcp-secret-manager",
				state: { versionId: "v2", metadata: { status: "pending" } },
				startedAt: new Date(),
			});

			expect(client.destroySecretVersion).toHaveBeenCalledTimes(1);
			expect(client.updateSecret).toHaveBeenCalledTimes(1);
		});

		it("continues cancelRotation when deleteVersion throws", async () => {
			const { provider, client } = createProvider();
			client.destroySecretVersion.mockRejectedValueOnce(new Error("already destroyed"));
			client.getSecret.mockResolvedValueOnce([{ labels: {} }]);
			client.updateSecret.mockResolvedValueOnce([{}]);

			await provider.cancelRotation({
				sessionId: "v2",
				secretName: "test-secret",
				provider: "gcp-secret-manager",
				state: { versionId: "v2", metadata: { status: "pending" } },
				startedAt: new Date(),
			});

			expect(client.updateSecret).toHaveBeenCalledTimes(1);
		});
	});

	describe("health", () => {
		it("returns healthy when API is accessible", async () => {
			const { provider, client } = createProvider();
			client.listSecrets.mockResolvedValueOnce([[]]);

			const health = await provider.health();

			expect(health.status).toBe("healthy");
		});

		it("returns unhealthy on errors", async () => {
			const { provider, client } = createProvider();
			client.listSecrets.mockRejectedValueOnce(new Error("API error"));

			const health = await provider.health();

			expect(health.status).toBe("unhealthy");
		});
	});

	describe("capabilities", () => {
		it("advertises all capabilities", () => {
			const provider = new GCPProvider({ type: "gcp", projectId: "test-project" });
			const caps = provider.capabilities();

			expect(caps.supportsRotation).toBe(true);
			expect(caps.supportsVersioning).toBe(true);
			expect(caps.supportsLabels).toBe(true);
		});
	});

	describe("supportsRotation", () => {
		it("returns true", () => {
			const provider = new GCPProvider({ type: "gcp", projectId: "test-project" });
			expect(provider.supportsRotation()).toBe(true);
		});
	});

	describe("timestampToDate", () => {
		it("handles numeric seconds", async () => {
			const { provider, client } = createProvider();
			client.addSecretVersion.mockResolvedValueOnce([
				{
					name: "projects/test-project/secrets/test-secret/versions/2",
					createTime: { seconds: 1700000000, nanos: 500_000_000 },
				},
			]);

			const result = await provider.storeSecretValue("test-secret", "new-value");

			expect(result.value).toBe("new-value");
			expect(result.createdAt.getTime()).toBe(1700000000500);
		});
	});
});
