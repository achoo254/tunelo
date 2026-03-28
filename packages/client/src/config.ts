import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface TuneloConfig {
	server?: string;
	key?: string;
}

function getConfigDir(): string {
	return join(homedir(), ".tunelo");
}

export function getConfigPath(): string {
	return join(getConfigDir(), "config.json");
}

export function loadConfig(): TuneloConfig {
	try {
		return JSON.parse(readFileSync(getConfigPath(), "utf-8")) as TuneloConfig;
	} catch {
		return {};
	}
}

export function saveConfig(config: TuneloConfig): void {
	const dir = getConfigDir();
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}
