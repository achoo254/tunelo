import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["packages/*/src/**/*.test.ts", "tests/**/*.test.ts"],
		exclude: ["tests/load/**"],
		testTimeout: 30_000,
	},
	resolve: {
		alias: {
			"@tunelo/shared": resolve(__dirname, "packages/shared/src/index.ts"),
		},
	},
});
