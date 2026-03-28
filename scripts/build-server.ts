import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

await build({
	entryPoints: [resolve(root, "packages/server/src/server.ts")],
	bundle: true,
	platform: "node",
	target: "node20",
	format: "cjs",
	outfile: resolve(root, "dist/server.cjs"),
	sourcemap: true,
	minify: false,
	// Bundle all deps into single file — no node_modules needed on server
	banner: {
		js: "// Tunelo Server — bundled with esbuild",
	},
});

console.log("Built dist/server.cjs");
