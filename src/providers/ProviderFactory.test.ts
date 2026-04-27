import { describe, expect, it } from "vitest";
import { AWSProvider } from "./AWSProvider.js";
import { GCPProvider } from "./GCPProvider.js";
import { ProviderFactory } from "./ProviderFactory.js";
import { VaultProvider } from "./VaultProvider.js";

describe("ProviderFactory", () => {
	describe("create", () => {
		it("creates AWS provider", () => {
			const provider = ProviderFactory.create({
				type: "aws",
				region: "us-east-1",
			});

			expect(provider).toBeInstanceOf(AWSProvider);
			expect(provider.name).toBe("aws-secrets-manager");
		});

		it("creates GCP provider", () => {
			const provider = ProviderFactory.create({
				type: "gcp",
				projectId: "my-project",
			});

			expect(provider).toBeInstanceOf(GCPProvider);
			expect(provider.name).toBe("gcp-secret-manager");
		});

		it("creates Vault provider", () => {
			const provider = ProviderFactory.create({
				type: "vault",
				url: "http://localhost:8200",
				mountPath: "secret",
				token: "test-token",
			});

			expect(provider).toBeInstanceOf(VaultProvider);
			expect(provider.name).toBe("vault");
		});

		it("throws for missing AWS region", () => {
			expect(() => ProviderFactory.create({ type: "aws" })).toThrow("region");
		});

		it("throws for missing GCP projectId", () => {
			expect(() => ProviderFactory.create({ type: "gcp" })).toThrow("projectId");
		});

		it("throws for missing Vault url", () => {
			expect(() => ProviderFactory.create({ type: "vault", mountPath: "secret" })).toThrow("url");
		});

		it("throws for missing Vault mountPath", () => {
			expect(() => ProviderFactory.create({ type: "vault", url: "http://localhost:8200" })).toThrow(
				"mountPath",
			);
		});

		it("throws for unknown provider type", () => {
			expect(() => ProviderFactory.create({ type: "unknown" as "aws" })).toThrow(
				"Unknown provider type",
			);
		});
	});
});
