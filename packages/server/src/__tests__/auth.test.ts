import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { loadApiKeys, validateApiKey } from "../auth.js";

describe("Auth", () => {
	const tmpFile = join(tmpdir(), `tunelo-test-keys-${Date.now()}.json`);

	beforeAll(() => {
		writeFileSync(
			tmpFile,
			JSON.stringify({ keys: ["tk_abc123", "tk_def456"] }),
		);
		loadApiKeys(tmpFile);
	});

	test("validateApiKey returns true for valid key", () => {
		expect(validateApiKey("tk_abc123")).toBe(true);
		expect(validateApiKey("tk_def456")).toBe(true);
	});

	test("validateApiKey returns false for invalid key", () => {
		expect(validateApiKey("tk_invalid")).toBe(false);
		expect(validateApiKey("")).toBe(false);
	});

	test("handles missing keys file gracefully", () => {
		const keys = loadApiKeys("/nonexistent/keys.json");
		expect(keys.size).toBe(0);
		// When no keys loaded, all pass (dev mode)
		expect(validateApiKey("anything")).toBe(true);
	});

	// Restore valid keys
	test("reloads keys from file", () => {
		loadApiKeys(tmpFile);
		expect(validateApiKey("tk_abc123")).toBe(true);
		expect(validateApiKey("anything")).toBe(false);
	});
});
