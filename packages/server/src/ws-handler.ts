import { randomUUID } from "node:crypto";
import type http from "node:http";
import {
	type AuthMessage,
	type ClientToServerMessage,
	DEFAULTS,
	ErrorCode,
	type RegisterTunnelMessage,
	SUBDOMAIN_REGEX,
	WS_CLOSE_CODES,
	buildTunnelUrl,
	parseMessage,
} from "@tunelo/shared";
import { customAlphabet } from "nanoid";
import { type WebSocket, WebSocketServer } from "ws";
import { validateApiKey } from "./auth.js";
import { createLogger } from "./logger.js";
import {
	type TcpConnectionState,
	cleanupTcpState,
	createTcpState,
	handleTcpConnectionClose,
	handleTcpData,
	handleTcpRegister,
} from "./tcp-ws-handler.js";
import { tunnelManager } from "./tunnel-manager.js";
import { safeSend } from "./ws-send.js";

const generateSubdomain = customAlphabet(
	"abcdefghijklmnopqrstuvwxyz0123456789",
	8,
);
const logger = createLogger("tunelo-ws");

/** Per-connection state attached after upgrade */
interface ConnectionState {
	id: string;
	authenticated: boolean;
	subdomain: string;
	messageCount: number;
	rateLimitInterval: ReturnType<typeof setInterval>;
	authTimer: ReturnType<typeof setTimeout>;
	pingInterval: ReturnType<typeof setInterval> | null;
	tcpState: TcpConnectionState;
	alive: boolean;
}

export function attachWsHandler(server: http.Server): void {
	const wss = new WebSocketServer({
		noServer: true,
		maxPayload: DEFAULTS.MAX_BODY_SIZE,
	});

	server.on("upgrade", (req, socket, head) => {
		const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
		if (pathname !== DEFAULTS.WS_PATH) {
			socket.destroy();
			return;
		}
		wss.handleUpgrade(req, socket, head, (ws) => {
			wss.emit("connection", ws, req);
		});
	});

	wss.on("connection", (ws: WebSocket) => {
		const state: ConnectionState = {
			id: randomUUID(),
			authenticated: false,
			subdomain: "",
			messageCount: 0,
			rateLimitInterval: setInterval(() => {
				state.messageCount = 0;
			}, 1000),
			authTimer: setTimeout(() => {
				if (!state.authenticated) {
					safeSend(ws, {
						type: "auth-result",
						success: false,
						subdomain: "",
						url: "",
						error: "Auth timeout",
					});
					ws.close(WS_CLOSE_CODES.AUTH_TIMEOUT, "Auth timeout");
				}
			}, 10_000),
			pingInterval: null,
			tcpState: createTcpState(),
			alive: true,
		};

		// Native ping/pong keepalive
		state.pingInterval = setInterval(() => {
			if (!state.alive) {
				ws.terminate();
				return;
			}
			state.alive = false;
			ws.ping();
		}, DEFAULTS.PING_INTERVAL_MS);

		ws.on("pong", () => {
			state.alive = true;
		});

		ws.on("message", (data) => {
			state.messageCount++;
			if (state.messageCount > DEFAULTS.WS_RATE_LIMIT) {
				logger.warn({ subdomain: state.subdomain }, "Rate limit exceeded");
				return;
			}

			let msg: ClientToServerMessage;
			try {
				msg = parseMessage(data.toString()) as ClientToServerMessage;
			} catch {
				logger.warn({ connectionId: state.id }, "Invalid JSON message");
				return;
			}

			switch (msg.type) {
				case "auth":
					handleAuth(ws, state, msg);
					break;
				case "register-tunnel":
					handleRegisterTunnel(ws, state, msg);
					break;
				case "response":
					if (!state.authenticated) return;
					tunnelManager.handleResponseByConnectionId(state.id, msg);
					break;
				case "tcp-register":
					if (!state.authenticated) return;
					handleTcpRegister(ws, state.id, msg, state.tcpState);
					break;
				case "tcp-data":
					if (!state.authenticated) return;
					handleTcpData(msg, state.tcpState);
					break;
				case "tcp-connection-close":
					if (!state.authenticated) return;
					handleTcpConnectionClose(msg, state.tcpState);
					break;
				case "pong":
					// Application-level pong — no-op, we use native WS pong
					break;
				default:
					break;
			}
		});

		ws.on("close", () => {
			clearTimeout(state.authTimer);
			clearInterval(state.rateLimitInterval);
			if (state.pingInterval) clearInterval(state.pingInterval);
			cleanupTcpState(state.tcpState);
			if (state.subdomain) tunnelManager.unregisterByConnectionId(state.id);
		});

		ws.on("error", (err) => {
			logger.error({ err, subdomain: state.subdomain }, "Socket error");
		});
	});
}

function handleAuth(
	ws: WebSocket,
	state: ConnectionState,
	msg: AuthMessage,
): void {
	if (state.authenticated) return;
	clearTimeout(state.authTimer);

	if (!validateApiKey(msg.key)) {
		safeSend(ws, {
			type: "auth-result",
			success: false,
			subdomain: "",
			url: "",
			error: "Invalid API key",
		});
		ws.close(WS_CLOSE_CODES.AUTH_FAILED, "Invalid API key");
		return;
	}

	const requestedSubdomain = msg.subdomain || generateSubdomain();

	if (!SUBDOMAIN_REGEX.test(requestedSubdomain)) {
		safeSend(ws, {
			type: "auth-result",
			success: false,
			subdomain: requestedSubdomain,
			url: "",
			error: "Invalid subdomain format",
		});
		ws.close(WS_CLOSE_CODES.AUTH_FAILED, "Invalid subdomain");
		return;
	}

	if (
		!tunnelManager.register(requestedSubdomain, ws, state.id, msg.key, msg.auth)
	) {
		safeSend(ws, {
			type: "auth-result",
			success: false,
			subdomain: requestedSubdomain,
			url: "",
			error: "Subdomain already in use",
		});
		ws.close(WS_CLOSE_CODES.SUBDOMAIN_TAKEN, "Subdomain taken");
		return;
	}

	state.authenticated = true;
	state.subdomain = requestedSubdomain;
	const url = buildTunnelUrl(requestedSubdomain);

	safeSend(ws, {
		type: "auth-result",
		success: true,
		subdomain: requestedSubdomain,
		url,
	});
	logger.info({ subdomain: requestedSubdomain, url }, "Client authenticated");
}

function handleRegisterTunnel(
	ws: WebSocket,
	state: ConnectionState,
	msg: RegisterTunnelMessage,
): void {
	if (!state.authenticated) return;

	const requestedSubdomain = msg.subdomain || generateSubdomain();

	if (!SUBDOMAIN_REGEX.test(requestedSubdomain)) {
		safeSend(ws, {
			type: "register-tunnel-result",
			success: false,
			subdomain: requestedSubdomain,
			localPort: msg.localPort,
			url: "",
			error: "Invalid subdomain format",
		});
		return;
	}

	const apiKey = tunnelManager.get(state.subdomain)?.apiKey ?? "";
	if (
		!tunnelManager.register(requestedSubdomain, ws, state.id, apiKey, msg.auth)
	) {
		safeSend(ws, {
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
	safeSend(ws, {
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
}
