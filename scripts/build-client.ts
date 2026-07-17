import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

await build({
	entryPoints: [resolve(root, "packages/client/src/cli.ts")],
	bundle: true,
	platform: "node",
	target: "node20",
	format: "esm",
	outfile: resolve(root, "packages/client/dist/cli.js"),
	sourcemap: true,
	minify: false,
	// Resolve @tunelo/shared from monorepo source
	alias: {
		"@tunelo/shared": resolve(root, "packages/shared/src/index.ts"),
	},
	// Externalize node builtins and heavy deps that users install
	external: ["chalk", "commander", "pino", "ws"],
	// Shebang comes from the entry file (src/cli.ts); esbuild preserves it at the
	// top of the bundle. Keep only a marker comment here to avoid a duplicate shebang.
	banner: {
		js: "// Tunelo CLI — bundled with esbuild",
	},
});

console.log("Built packages/client/dist/cli.js");
