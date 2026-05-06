import { execSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const distDir = resolve(root, "dist");

// Clean previous build
if (existsSync(distDir)) {
	rmSync(distDir, { recursive: true, force: true });
}

// Build shared (server bundle imports from @tunelo/shared)
console.log("Building @tunelo/shared...");
execSync("pnpm --filter @tunelo/shared build", { stdio: "inherit", cwd: root });

// Build dashboard SPA
console.log("Building @tunelo/dashboard...");
execSync("pnpm --filter @tunelo/dashboard build", {
	stdio: "inherit",
	cwd: root,
});

// Read server's runtime deps to compute external list
// Bundle @tunelo/* workspace packages INTO server.mjs (so VPS doesn't need them)
// Externalize npm packages — VPS runs `pnpm install --prod` to provide them
const serverPkg = JSON.parse(
	readFileSync(resolve(root, "packages/server/package.json"), "utf-8"),
);
const npmDeps = Object.keys(
	serverPkg.dependencies as Record<string, string>,
).filter((name) => !name.startsWith("@tunelo/"));

console.log("Bundling server...");
await build({
	entryPoints: [resolve(root, "packages/server/src/server.ts")],
	bundle: true,
	platform: "node",
	target: "node20",
	format: "esm",
	outfile: resolve(distDir, "server.mjs"),
	sourcemap: true,
	minify: false,
	external: npmDeps,
	banner: {
		js: "// Tunelo Server — bundled with esbuild",
	},
});

// Copy dashboard build output next to server bundle (dist/dashboard/)
// server.ts resolves dashboardDist to <serverFileDir>/dashboard in production
const dashboardSrc = resolve(root, "packages/dashboard/dist");
const dashboardDest = resolve(distDir, "dashboard");
if (existsSync(dashboardSrc)) {
	cpSync(dashboardSrc, dashboardDest, { recursive: true });
	console.log(`Copied dashboard → ${dashboardDest}`);
} else {
	console.warn(`Dashboard dist not found at ${dashboardSrc} — skipping copy`);
}

// Generate sanitized package.json for production install on VPS
// - Strip workspace dep (@tunelo/shared is bundled into server.mjs)
// - Strip devDependencies
const prodPkg = {
	name: serverPkg.name,
	version: serverPkg.version,
	type: serverPkg.type,
	main: "server.mjs",
	scripts: { start: "node server.mjs" },
	dependencies: Object.fromEntries(
		Object.entries(serverPkg.dependencies as Record<string, string>).filter(
			([name]) => !name.startsWith("@tunelo/"),
		),
	),
};
writeFileSync(
	resolve(distDir, "package.json"),
	`${JSON.stringify(prodPkg, null, 2)}\n`,
);
console.log("Wrote dist/package.json (production deps only)");

console.log("Build complete: dist/server.mjs + dist/dashboard/ + dist/package.json");
