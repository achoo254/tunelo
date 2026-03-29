import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import type { Command } from "commander";
import * as api from "./api-client.js";
import { loadConfig, saveConfig } from "./config.js";

/** Read a line from stdin (visible input) */
function prompt(question: string): Promise<string> {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

/** Read password from stdin (hidden input — works on Windows + Unix) */
function promptPassword(question: string): Promise<string> {
	return new Promise((resolve) => {
		// Muted output stream that suppresses writes (hides typed chars)
		const muted = new Writable({
			write(_chunk, _encoding, callback) {
				callback();
			},
		});

		const rl = createInterface({
			input: process.stdin,
			output: muted,
			terminal: true,
		});

		// Write question directly to stdout (not through readline)
		process.stdout.write(question);

		rl.question("", (answer) => {
			rl.close();
			process.stdout.write("\n");
			resolve(answer);
		});
	});
}

function getServerBaseUrl(): string {
	const config = loadConfig();
	const serverUrl =
		process.env.TUNELO_SERVER ??
		config.server ??
		"wss://tunnel.inetdev.io.vn";
	return api.getApiBaseUrl(serverUrl);
}

/** Prompt for email + password with validation, retry on failure */
async function promptCredentials(): Promise<{
	email: string;
	password: string;
}> {
	for (;;) {
		const email = await prompt("Email: ");
		if (!email) {
			console.error("Email is required.");
			continue;
		}

		const password = await promptPassword("Password: ");
		if (password.length < 8) {
			console.error("Password must be at least 8 characters. Try again.\n");
			continue;
		}

		return { email, password };
	}
}

export function registerAuthCommands(program: Command): void {
	program
		.command("register")
		.description("Create a new Tunelo account")
		.action(async () => {
			const baseUrl = getServerBaseUrl();

			for (;;) {
				try {
					const { email, password } = await promptCredentials();
					const confirmPassword = await promptPassword("Confirm password: ");

					if (password !== confirmPassword) {
						console.error("Passwords do not match. Try again.\n");
						continue;
					}

					const result = await api.signup(baseUrl, email, password);

					if (result.requireTotp) {
						console.log("\n2FA setup required (admin account):");
						if (result.totpSecret) {
							console.log(`  Manual key: ${result.totpSecret}`);
						}
						if (result.qrDataUrl) {
							console.log(
								"  QR code data URL generated — use dashboard to scan.",
							);
						}
						const totpCode = await prompt("TOTP code: ");
						await api.verifyTotp(baseUrl, result.userId, totpCode);
						console.log("✓ 2FA verified!");
					}

					console.log(
						"✓ Registered! Run `tunelo login` to get your API key.",
					);
					return;
				} catch (err) {
					if (err instanceof api.ApiClientError) {
						console.error(`Error: ${err.message} (${err.code})\n`);
					} else {
						console.error(`Error: ${(err as Error).message}\n`);
					}
					// Let user retry
				}
			}
		});

	program
		.command("login")
		.description("Login and save API key to config")
		.action(async () => {
			const baseUrl = getServerBaseUrl();

			for (;;) {
				try {
					const email = await prompt("Email: ");
					const password = await promptPassword("Password: ");

					let totpCode: string | undefined;
					const totpInput = await prompt("TOTP code (Enter to skip): ");
					if (totpInput) totpCode = totpInput;

					const { hostname } = await import("node:os");
					const dateStr = new Date()
						.toISOString()
						.slice(2, 10)
						.replace(/-/g, "");
					const keyLabel = `cli-${hostname()}-${dateStr}`;

					const result = await api.loginCli(
						baseUrl,
						email,
						password,
						totpCode,
						keyLabel,
					);

					const config = loadConfig();
					config.key = result.key;
					saveConfig(config);

					console.log(`✓ Logged in as ${email} (${result.role})`);
					console.log(`  API key saved to config: ${result.keyPrefix}`);
					return;
				} catch (err) {
					if (err instanceof api.ApiClientError) {
						if (err.code === "TUNELO_AUTH_005") {
							console.error(
								"Error: TOTP code is required for this account.\n",
							);
						} else {
							console.error(`Error: ${err.message} (${err.code})\n`);
						}
					} else {
						console.error(`Error: ${(err as Error).message}\n`);
					}
					// Let user retry
				}
			}
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
			delete config.key;
			saveConfig(config);
			console.log("✓ Logged out. API key removed from config.");
		});
}
