import { describe, expect, it } from "vitest";
import {
	ValidationError,
	assertValid,
	validateCoverage,
	validateInterval,
	validateMetadata,
	validateSecretName,
} from "./InputValidator.js";

describe("validateSecretName", () => {
	it("accepts valid names", () => {
		expect(validateSecretName("my-secret.01_name").valid).toBe(true);
		expect(validateSecretName("a").valid).toBe(true);
		expect(validateSecretName("ABC").valid).toBe(true);
	});

	it("rejects non-string", () => {
		expect(validateSecretName(123).valid).toBe(false);
		expect(validateSecretName(null).valid).toBe(false);
	});

	it("rejects empty string", () => {
		expect(validateSecretName("").valid).toBe(false);
	});

	it("rejects names over 128 chars", () => {
		expect(validateSecretName("a".repeat(129)).valid).toBe(false);
	});

	it("rejects names starting with dot or hyphen", () => {
		expect(validateSecretName(".abc").valid).toBe(false);
		expect(validateSecretName("-abc").valid).toBe(false);
	});
});

describe("validateMetadata", () => {
	it("accepts undefined or null", () => {
		expect(validateMetadata(undefined).valid).toBe(true);
		expect(validateMetadata(null).valid).toBe(true);
	});

	it("accepts a plain object", () => {
		expect(validateMetadata({ key: "value" }).valid).toBe(true);
	});

	it("rejects arrays", () => {
		expect(validateMetadata(["a"]).valid).toBe(false);
	});

	it("rejects objects with too many keys", () => {
		const obj: Record<string, string> = {};
		for (let i = 0; i < 60; i++) obj[`key${i}`] = "v";
		expect(validateMetadata(obj).valid).toBe(false);
	});
});

describe("validateInterval", () => {
	it("accepts valid interval", () => {
		expect(validateInterval(60000).valid).toBe(true);
		expect(validateInterval(1000).valid).toBe(true);
	});

	it("rejects non-number", () => {
		expect(validateInterval("60000").valid).toBe(false);
	});

	it("rejects zero or negative", () => {
		expect(validateInterval(0).valid).toBe(false);
		expect(validateInterval(-100).valid).toBe(false);
	});

	it("rejects values under 1000ms", () => {
		expect(validateInterval(500).valid).toBe(false);
	});
});

describe("validateCoverage", () => {
	it("accepts valid ratio", () => {
		expect(validateCoverage(0.5).valid).toBe(true);
		expect(validateCoverage(0).valid).toBe(true);
		expect(validateCoverage(1).valid).toBe(true);
	});

	it("rejects out of range", () => {
		expect(validateCoverage(1.1).valid).toBe(false);
		expect(validateCoverage(-0.1).valid).toBe(false);
	});

	it("rejects non-number", () => {
		expect(validateCoverage("0.5").valid).toBe(false);
	});
});

describe("assertValid", () => {
	it("throws ValidationError on invalid result", () => {
		const result = validateSecretName("");
		expect(() => assertValid(result, "Test")).toThrow(ValidationError);
	});

	it("does not throw on valid result", () => {
		const result = validateSecretName("valid-name");
		expect(() => assertValid(result)).not.toThrow();
	});
});
