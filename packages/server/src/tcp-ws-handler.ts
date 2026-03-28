/** TCP tunnel WebSocket event handlers — handles tcp-register, tcp-data, tcp-connection-close */

import {
	DEFAULTS,
	TUNNEL_DOMAIN,
	type TcpRegisterMessage,
} from "@tunelo/shared";
import type { WebSocket } from "ws";
import { createLogger } from "./logger.js";
import { tcpPortManager } from "./tcp-port-manager.js";
import { type TcpRelay, createTcpRelay } from "./tcp-relay.js";
import { safeSend } from "./ws-send.js";

const logger = createLogger("tunelo-tcp-ws");

/** Per-connection TCP state — created after auth, cleaned up on close */
export interface TcpConnectionState {
	relays: Map<number, TcpRelay>;
	connectionToRelay: Map<string, TcpRelay>;
}

export function createTcpState(): TcpConnectionState {
	return { relays: new Map(), connectionToRelay: new Map() };
}

export function handleTcpRegister(
	ws: WebSocket,
	connectionId: string,
	msg: TcpRegisterMessage,
	state: TcpConnectionState,
): void {
	const port = tcpPortManager.allocate(
		connectionId,
		msg.localPort,
		msg.remotePort,
	);
	if (port === null) {
		safeSend(ws, {
			type: "tcp-register-result",
			success: false,
			localPort: msg.localPort,
			remotePort: 0,
			url: "",
			error: "No TCP ports available",
		});
		return;
	}

	try {
		const relay = createTcpRelay(port, ws, (connId) => {
			state.connectionToRelay.set(connId, relay);
		});
		state.relays.set(port, relay);

		const url = `tcp://${TUNNEL_DOMAIN}:${port}`;
		safeSend(ws, {
			type: "tcp-register-result",
			success: true,
			localPort: msg.localPort,
			remotePort: port,
			url,
		});
		logger.info(
			{ remotePort: port, localPort: msg.localPort, url },
			"TCP tunnel registered",
		);
	} catch (err) {
		tcpPortManager.release(port);
		safeSend(ws, {
			type: "tcp-register-result",
			success: false,
			localPort: msg.localPort,
			remotePort: port,
			url: "",
			error: (err as Error).message,
		});
	}
}

export function handleTcpData(
	msg: { connectionId: string; data: string },
	state: TcpConnectionState,
): void {
	const relay = state.connectionToRelay.get(msg.connectionId);
	if (relay) {
		relay.writeToConnection(msg.connectionId, Buffer.from(msg.data, "base64"));
	}
}

export function handleTcpConnectionClose(
	msg: { connectionId: string },
	state: TcpConnectionState,
): void {
	const relay = state.connectionToRelay.get(msg.connectionId);
	if (relay) {
		relay.closeConnection(msg.connectionId);
		state.connectionToRelay.delete(msg.connectionId);
	}
}

/** Clean up all TCP relays for a disconnected connection */
export function cleanupTcpState(state: TcpConnectionState): void {
	state.connectionToRelay.clear();
	for (const [port, relay] of state.relays) {
		relay.close();
		tcpPortManager.release(port);
	}
	state.relays.clear();
}
