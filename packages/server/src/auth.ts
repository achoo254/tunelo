import { createHash } from "node:crypto";
import { readFileSync, watchFile } from "node:fs";
import { createLogger } from "./logger.js";

const logger = createLogger("tunelo-auth");

/** Store hashed keys — never compare plaintext */
let apiKeyHashes = new Set<string>();

function hashKey(key: string): string {
	return createHash("sha256").update(key).digest("hex");
}

export function loadApiKeys(filePath: string): Set<string> {
	try {
		const data = JSON.parse(readFileSync(filePath, "utf-8")) as {
			keys: string[];
		};
		apiKeyHashes = new Set(data.keys.map(hashKey));
		logger.info({ count: apiKeyHashes.size }, "API keys loaded");
	} catch (err) {
		logger.warn(
			{ filePath, err },
			"Failed to load API keys — accepting all connections",
		);
		apiKeyHashes = new Set();
	}
	return apiKeyHashes;
}

export function watchApiKeys(filePath: string): void {
	watchFile(filePath, { interval: 5000 }, () => {
		logger.info("API keys file changed, reloading");
		loadApiKeys(filePath);
	});
}

export function validateApiKey(key: string): boolean {
	// If no keys loaded, accept all (dev mode)
	if (apiKeyHashes.size === 0) return true;
	return apiKeyHashes.has(hashKey(key));
}
