import type http from "node:http";
import {
	type AuthMessage,
	type ClientToServerEvents,
	DEFAULTS,
	ErrorCode,
	type RegisterTunnelMessage,
	SUBDOMAIN_REGEX,
	type ServerToClientEvents,
	buildTunnelUrl,
} from "@tunelo/shared";
import { customAlphabet } from "nanoid";
import { type Socket, Server as SocketIOServer } from "socket.io";
import { validateApiKey } from "./auth.js";
import { createLogger } from "./logger.js";
import { attachTcpHandlers } from "./tcp-ws-handler.js";
import { tunnelManager } from "./tunnel-manager.js";

const logger = createLogger("tunelo-ws");

export function attachWsHandler(server: http.Server): void {
	const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
		server,
		{
			path: DEFAULTS.WS_PATH,
			// Ping/pong handled by socket.io engine
			pingInterval: DEFAULTS.PING_INTERVAL_MS,
			pingTimeout: DEFAULTS.PING_INTERVAL_MS,
			// Max payload 10MB
			maxHttpBufferSize: DEFAULTS.MAX_BODY_SIZE,
			// Allow Cloudflare proxy
			cors: { origin: "*" },
			// Use websocket transport, fallback to polling for Cloudflare compat
			transports: ["websocket", "polling"],
		},
	);

	io.on(
		"connection",
		(socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
			let authenticated = false;
			let subdomain = "";

			// Rate limiting: max 100 messages per second
			let messageCount = 0;
			const rateLimitInterval = setInterval(() => {
				messageCount = 0;
			}, 1000);

			// Auth timeout — client must auth within 10s
			const authTimer = setTimeout(() => {
				if (!authenticated) {
					socket.emit("auth-result", {
						type: "auth-result",
						success: false,
						subdomain: "",
						url: "",
						error: "Auth timeout",
					});
					socket.disconnect(true);
				}
			}, 10_000);

			// Handle auth
			socket.on("auth", (msg: AuthMessage) => {
				messageCount++;
				if (messageCount > DEFAULTS.WS_RATE_LIMIT) {
					logger.warn({ subdomain }, "Rate limit exceeded");
					return;
				}

				if (authenticated) return;

				clearTimeout(authTimer);

				if (!validateApiKey(msg.key)) {
					socket.emit("auth-result", {
						type: "auth-result",
						success: false,
						subdomain: "",
						url: "",
						error: "Invalid API key",
					});
					socket.disconnect(true);
					return;
				}

				const generateSubdomain = customAlphabet(
					"abcdefghijklmnopqrstuvwxyz0123456789",
					8,
				);
				const requestedSubdomain = msg.subdomain || generateSubdomain();

				if (!SUBDOMAIN_REGEX.test(requestedSubdomain)) {
					socket.emit("auth-result", {
						type: "auth-result",
						success: false,
						subdomain: requestedSubdomain,
						url: "",
						error: "Invalid subdomain format",
					});
					socket.disconnect(true);
					return;
				}

				if (
					!tunnelManager.register(requestedSubdomain, socket, msg.key, msg.auth)
				) {
					socket.emit("auth-result", {
						type: "auth-result",
						success: false,
						subdomain: requestedSubdomain,
						url: "",
						error: "Subdomain already in use",
					});
					socket.disconnect(true);
					return;
				}

				authenticated = true;
				subdomain = requestedSubdomain;
				const url = buildTunnelUrl(subdomain);

				socket.emit("auth-result", {
					type: "auth-result",
					success: true,
					subdomain,
					url,
				});
				logger.info({ subdomain, url }, "Client authenticated");

				// Attach TCP tunnel handlers after successful auth
				attachTcpHandlers(socket);
			});

			// Handle additional tunnel registration on same socket
			socket.on("register-tunnel", (msg: RegisterTunnelMessage) => {
				messageCount++;
				if (messageCount > DEFAULTS.WS_RATE_LIMIT) {
					logger.warn({ subdomain }, "Rate limit exceeded");
					return;
				}
				if (!authenticated) return;

				const generateSubdomain = customAlphabet(
					"abcdefghijklmnopqrstuvwxyz0123456789",
					8,
				);
				const requestedSubdomain = msg.subdomain || generateSubdomain();

				if (!SUBDOMAIN_REGEX.test(requestedSubdomain)) {
					socket.emit("register-tunnel-result", {
						type: "register-tunnel-result",
						success: false,
						subdomain: requestedSubdomain,
						localPort: msg.localPort,
						url: "",
						error: "Invalid subdomain format",
					});
					return;
				}

				const apiKey = tunnelManager.get(subdomain)?.apiKey ?? "";
				if (
					!tunnelManager.register(requestedSubdomain, socket, apiKey, msg.auth)
				) {
					socket.emit("register-tunnel-result", {
						type: "register-tunnel-result",
						success: false,
						subdomain: requestedSubdomain,
						localPort: msg.localPort,
						url: "",
						error: "Subdomain already in use",
					});
					return;
				}

				const url = buildTunnelUrl(requestedSubdomain);
				socket.emit("register-tunnel-result", {
					type: "register-tunnel-result",
					success: true,
					subdomain: requestedSubdomain,
					localPort: msg.localPort,
					url,
				});
				logger.info(
					{ subdomain: requestedSubdomain, url, localPort: msg.localPort },
					"Additional tunnel registered",
				);
			});

			// Handle tunnel responses from client
			socket.on("response", (response) => {
				messageCount++;
				if (messageCount > DEFAULTS.WS_RATE_LIMIT) {
					logger.warn({ subdomain }, "Rate limit exceeded, dropping message");
					return;
				}
				if (!authenticated) return;
				// Use socket-based lookup for multi-tunnel support
				tunnelManager.handleResponseBySocket(socket.id, response);
			});

			socket.on("disconnect", () => {
				clearTimeout(authTimer);
				clearInterval(rateLimitInterval);
				// Unregister all subdomains for this socket (multi-tunnel support)
				if (subdomain) tunnelManager.unregisterBySocket(socket.id);
			});

			socket.on("error", (err) => {
				logger.error({ err, subdomain }, "Socket error");
			});
		},
	);
}
