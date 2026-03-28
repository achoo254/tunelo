import http from "node:http";
import { DEFAULTS } from "@tunelo/shared";
import { loadApiKeys, watchApiKeys } from "./auth.js";
import { createLogger } from "./logger.js";
import { createRelayHandler } from "./request-relay.js";
import { tunnelManager } from "./tunnel-manager.js";
import { attachWsHandler } from "./ws-handler.js";

const logger = createLogger("tunelo-server");

const port = Number(process.env.TUNNEL_PORT) || DEFAULTS.SERVER_PORT;
const keysFile = process.env.API_KEYS_FILE ?? "./keys.json";

// Load API keys
loadApiKeys(keysFile);
watchApiKeys(keysFile);

// Create HTTP server with relay handler
const server = http.createServer(createRelayHandler());

// Attach WebSocket handler
attachWsHandler(server);

server.listen(port, () => {
	logger.info("=".repeat(50));
	logger.info(
		{ port, nodeVersion: process.version, pid: process.pid },
		"Tunelo server started",
	);
	logger.info("=".repeat(50));
});

// Graceful shutdown
function shutdown(signal: string): void {
	logger.info({ signal }, "Shutting down");
	tunnelManager.closeAll();
	server.close(() => {
		logger.info("Server closed");
		process.exit(0);
	});
	// Force exit after 5s
	setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
