#!/usr/bin/env node
import type { RegisterTunnelResult } from "@tunelo/shared";
import { program } from "commander";
import { registerTcpCommand } from "./cli-tcp-command.js";
import { getConfigPath, loadConfig, saveConfig } from "./config.js";
import { Display } from "./display.js";
import { createInspectorIntegration } from "./inspector-integration.js";
import type { InspectorEntry } from "./request-store.js";
import { TunnelClient } from "./tunnel-client.js";
import { parseTunnelArgs } from "./tunnel-config-parser.js";

const display = new Display();

program
	.name("tunelo")
	.version("0.1.0")
	.description("Expose local services to the internet");

program
	.command("http <ports...>")
	.description("Create HTTP tunnel(s). Format: <port> or <port>:<subdomain>")
	.option(
		"-s, --subdomain <name>",
		"Request specific subdomain (single tunnel only)",
	)
	.option("-k, --key <apikey>", "API key for authentication")
	.option("--server <url>", "Tunnel server URL")
	.option("-a, --auth <user:pass>", "Protect tunnel(s) with Basic Auth")
	.option("--inspect-port <port>", "Inspector UI port (default: 4040)", "4040")
	.option("--no-inspect", "Disable request inspector")
	.option("-q, --quiet", "Suppress request logging")
	.option("-v, --verbose", "Show extra details (body size)")
	.action(
		async (
			portArgs: string[],
			options: {
				subdomain?: string;
				key?: string;
				auth?: string;
				server?: string;
				inspectPort?: string;
				inspect?: boolean;
				quiet?: boolean;
				verbose?: boolean;
			},
		) => {
			let tunnels: import("./tunnel-config-parser.js").TunnelMapping[];
			try {
				tunnels = parseTunnelArgs(portArgs);
			} catch (err) {
				display.showError((err as Error).message);
				process.exit(1);
			}

			const config = loadConfig();
			const apiKey = options.key ?? process.env.TUNELO_KEY ?? config.key;
			const serverUrl =
				options.server ??
				process.env.TUNELO_SERVER ??
				config.server ??
				"wss://tunnel.inetdev.io.vn";

			if (!apiKey) {
				display.showError(
					"API key required. Use --key, TUNELO_KEY env, or `tunelo config --key <key>`",
				);
				process.exit(1);
			}

			if (options.quiet) display.setLogLevel("quiet");
			else if (options.verbose) display.setLogLevel("verbose");

			display.showBanner("0.1.0");
			display.showConnecting(serverUrl);

			const primary = tunnels[0];
			const additional = tunnels.slice(1);
			const subdomainPortMap = new Map<string, number>();
			const inspectPort = Number(options.inspectPort) || 4040;

			const inspector =
				options.inspect !== false
					? createInspectorIntegration({
							inspectPort,
							subdomainPortMap,
							defaultPort: primary.port,
						})
					: null;

			const client = new TunnelClient({
				serverUrl,
				apiKey,
				subdomain: options.subdomain ?? primary.subdomain,
				localPort: primary.port,
				auth: options.auth,
				additionalTunnels: additional,
			});

			client.on("connected", (result: { url: string; subdomain: string }) => {
				subdomainPortMap.set(result.subdomain, primary.port);
				display.showConnected(
					result.url,
					`http://localhost:${primary.port}`,
					apiKey,
					options.auth !== undefined,
				);
				if (inspector) {
					inspector.start();
					display.showInspector(inspectPort);
				}
			});

			client.on("tunnel-registered", (result: RegisterTunnelResult) => {
				subdomainPortMap.set(result.subdomain, result.localPort);
				display.showTunnelRegistered(
					result.subdomain,
					result.url,
					result.localPort,
				);
			});

			client.on("tunnel-register-error", (result: RegisterTunnelResult) => {
				display.showError(`Tunnel ${result.subdomain}: ${result.error}`);
			});

			if (inspector) {
				client.on("inspector-entry", (entry: InspectorEntry) => {
					inspector.store.add(entry);
				});
			}

			client.on("disconnected", () => display.showDisconnected());
			client.on("reconnecting", (info: { attempt: number; delay: number }) => {
				display.showReconnecting(info.attempt, info.delay);
			});
			client.on(
				"request",
				(info: {
					method: string;
					path: string;
					status: number;
					durationMs: number;
					subdomain?: string;
				}) => {
					display.logRequest(
						info.method,
						info.path,
						info.status,
						info.durationMs,
						undefined,
						info.subdomain,
					);
				},
			);
			client.on("error", (err: Error) => display.showError(err.message));

			try {
				await client.connect();
			} catch (err) {
				display.showError((err as Error).message);
				process.exit(1);
			}

			process.on("SIGINT", () => {
				client.disconnect();
				display.showStats();
				process.exit(0);
			});
		},
	);

registerTcpCommand(program, display);

program
	.command("config")
	.description("Set default configuration")
	.option("-k, --key <apikey>", "Set default API key")
	.option("-s, --server <url>", "Set default server URL")
	.option("--show", "Show current config")
	.action((options: { key?: string; server?: string; show?: boolean }) => {
		if (options.show) {
			const config = loadConfig();
			console.log(`Config path: ${getConfigPath()}`);
			console.log(JSON.stringify(config, null, 2));
			return;
		}

		const config = loadConfig();
		if (options.key) config.key = options.key;
		if (options.server) config.server = options.server;
		saveConfig(config);
		console.log("Config saved.");
	});

program.parse();
