import type { Command } from "commander";
import * as api from "./api-client.js";
import { loadConfig, saveConfig } from "./config.js";

const POLL_INTERVAL_MS = 3_000;
const TIMEOUT_MS = 5 * 60 * 1000;

function getServerBaseUrl(): string {
	const config = loadConfig();
	const serverUrl =
		process.env.TUNELO_SERVER ?? config.server ?? "wss://tunnel.inetdev.io.vn";
	return api.getApiBaseUrl(serverUrl);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Open URL in default browser — cross-platform, no heavy deps */
async function openBrowser(url: string): Promise<void> {
	const { platform } = process;
	const { execFile } = await import("node:child_process");
	const { promisify } = await import("node:util");
	const execFileAsync = promisify(execFile);

	try {
		if (platform === "darwin") {
			await execFileAsync("open", [url]);
		} else if (platform === "win32") {
			await execFileAsync("cmd", ["/c", "start", "", url]);
		} else {
			await execFileAsync("xdg-open", [url]);
		}
	} catch {
		// Silently fail — user gets URL printed in terminal
	}
}

async function deviceAuthFlow(mode: "login" | "signup"): Promise<void> {
	const baseUrl = getServerBaseUrl();

	const { deviceCode, userCode, verificationUrl } =
		await api.createDeviceCode(baseUrl);

	// For signup: redirect through signup page first, then back to device auth
	const url =
		mode === "signup"
			? `${baseUrl}/portal/signup?next=${encodeURIComponent(`/auth/device?code=${userCode}`)}`
			: verificationUrl;

	console.log();
	console.log(`  Opening browser to ${mode}...`);
	console.log(`  ${url}`);
	console.log();
	console.log(`  Your code: ${userCode}`);
	console.log();

	await openBrowser(url);

	console.log("  Waiting for authentication...");

	const startTime = Date.now();
	let aborted = false;

	const onSigint = (): void => {
		aborted = true;
	};
	process.on("SIGINT", onSigint);

	try {
		while (!aborted && Date.now() - startTime < TIMEOUT_MS) {
			await sleep(POLL_INTERVAL_MS);

			try {
				const result = await api.pollDeviceCode(baseUrl, deviceCode);

				if (result.status === "approved") {
					const config = loadConfig();
					config.key = result.key ?? "";
					saveConfig(config);
					console.log(`  Logged in as ${result.email}`);
					console.log(`  API key saved: ${result.keyPrefix}`);
					return;
				}

				if (result.status === "expired") {
					console.error("  Device code expired. Run the command again.");
					process.exit(1);
				}
			} catch {
				// Network error during poll — continue trying
			}
		}

		if (aborted) {
			console.log("\n  Cancelled.");
		} else {
			console.error("  Timed out waiting for authentication.");
		}
		process.exit(1);
	} finally {
		process.removeListener("SIGINT", onSigint);
	}
}

export function registerDeviceAuthCommands(program: Command): void {
	program
		.command("login")
		.description("Login via browser")
		.action(async () => {
			await deviceAuthFlow("login");
		});

	program
		.command("register")
		.description("Create account via browser")
		.action(async () => {
			await deviceAuthFlow("signup");
		});

	program
		.command("logout")
		.description("Remove API key from config")
		.action(() => {
			const config = loadConfig();
			if (!config.key) {
				console.log("Not logged in (no API key in config).");
				return;
			}
			config.key = undefined;
			saveConfig(config);
			console.log("Logged out. API key removed from config.");
		});
}
