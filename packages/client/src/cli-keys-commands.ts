import type { Command } from "commander";
import * as api from "./api-client.js";
import { loadConfig } from "./config.js";

function getAuthContext(): { baseUrl: string; apiKey: string } {
	const config = loadConfig();
	const serverUrl =
		process.env.TUNELO_SERVER ??
		config.server ??
		"wss://tunnel.inetdev.io.vn";
	const baseUrl = api.getApiBaseUrl(serverUrl);
	const apiKey = process.env.TUNELO_KEY ?? config.key;

	if (!apiKey) {
		console.error(
			"No API key found. Run `tunelo login` or set TUNELO_KEY env.",
		);
		process.exit(1);
	}

	return { baseUrl, apiKey };
}

export function registerKeysCommands(program: Command): void {
	const keys = program
		.command("keys")
		.description("Manage API keys");

	keys
		.command("list")
		.description("List your active API keys")
		.action(async () => {
			try {
				const { baseUrl, apiKey } = getAuthContext();
				const keyList = await api.listKeys(baseUrl, apiKey);

				if (keyList.length === 0) {
					console.log("No active API keys.");
					return;
				}

				// Table header
				console.log(
					`${"ID".padEnd(26)} ${"Label".padEnd(24)} ${"Created".padEnd(12)} Status`,
				);
				console.log("-".repeat(72));

				for (const k of keyList) {
					const created = new Date(k.createdAt)
						.toISOString()
						.slice(0, 10);
					console.log(
						`${k.id.padEnd(26)} ${k.label.padEnd(24)} ${created.padEnd(12)} ${k.status}`,
					);
				}
			} catch (err) {
				if (err instanceof api.ApiClientError) {
					console.error(`Error: ${err.message} (${err.code})`);
				} else {
					console.error(`Error: ${(err as Error).message}`);
				}
				process.exit(1);
			}
		});

	keys
		.command("create")
		.description("Create a new API key")
		.option("-l, --label <label>", "Key label", "Default")
		.action(async (options: { label: string }) => {
			try {
				const { baseUrl, apiKey } = getAuthContext();
				const result = await api.createKey(baseUrl, apiKey, options.label);

				console.log(`✓ Key created: ${result.key}`);
				console.log(`  ID: ${result.id}`);
				console.log(`  Prefix: ${result.keyPrefix}`);
				console.log(
					"\n  Save this key — it will not be shown again.",
				);
			} catch (err) {
				if (err instanceof api.ApiClientError) {
					console.error(`Error: ${err.message} (${err.code})`);
				} else {
					console.error(`Error: ${(err as Error).message}`);
				}
				process.exit(1);
			}
		});

	keys
		.command("revoke <keyId>")
		.description("Revoke an API key")
		.action(async (keyId: string) => {
			try {
				const { baseUrl, apiKey } = getAuthContext();
				await api.revokeKey(baseUrl, apiKey, keyId);
				console.log(`✓ Key ${keyId} revoked.`);
			} catch (err) {
				if (err instanceof api.ApiClientError) {
					console.error(`Error: ${err.message} (${err.code})`);
				} else {
					console.error(`Error: ${(err as Error).message}`);
				}
				process.exit(1);
			}
		});
}
