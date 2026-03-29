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
	format: "esm",
	outfile: resolve(root, "dist/server.mjs"),
	sourcemap: true,
	minify: false,
	banner: {
		js: "// Tunelo Server — bundled with esbuild",
	},
});

console.log("Built dist/server.mjs");
