/** TCP tunnel WebSocket event handlers — handles tcp-register, tcp-data, tcp-connection-close */

import {
	type ClientToServerEvents,
	DEFAULTS,
	type ServerToClientEvents,
	TUNNEL_DOMAIN,
	type TcpRegisterMessage,
} from "@tunelo/shared";
import type { Socket } from "socket.io";
import { createLogger } from "./logger.js";
import { tcpPortManager } from "./tcp-port-manager.js";
import { type TcpRelay, createTcpRelay } from "./tcp-relay.js";

const logger = createLogger("tunelo-tcp-ws");

/** Attach TCP tunnel handlers to an authenticated socket */
export function attachTcpHandlers(
	socket: Socket<ClientToServerEvents, ServerToClientEvents>,
): void {
	const relays = new Map<number, TcpRelay>();
	/** Maps connectionId → relay for direct routing */
	const connectionToRelay = new Map<string, TcpRelay>();

	socket.on("tcp-register", (msg: TcpRegisterMessage) => {
		const port = tcpPortManager.allocate(
			socket.id,
			msg.localPort,
			msg.remotePort,
		);
		if (port === null) {
			socket.emit("tcp-register-result", {
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
			const relay = createTcpRelay(port, socket, (connId) => {
				connectionToRelay.set(connId, relay);
			});
			relays.set(port, relay);

			const url = `tcp://${TUNNEL_DOMAIN}:${port}`;
			socket.emit("tcp-register-result", {
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
			socket.emit("tcp-register-result", {
				type: "tcp-register-result",
				success: false,
				localPort: msg.localPort,
				remotePort: port,
				url: "",
				error: (err as Error).message,
			});
		}
	});

	// Forward WS data to correct TCP connection via connectionId→relay map
	socket.on("tcp-data", (msg) => {
		const relay = connectionToRelay.get(msg.connectionId);
		if (relay) {
			relay.writeToConnection(msg.connectionId, Buffer.from(msg.data, "base64"));
		}
	});

	// Client closed a TCP connection
	socket.on("tcp-connection-close", (msg) => {
		const relay = connectionToRelay.get(msg.connectionId);
		if (relay) {
			relay.closeConnection(msg.connectionId);
			connectionToRelay.delete(msg.connectionId);
		}
	});

	// Cleanup on disconnect
	socket.on("disconnect", () => {
		connectionToRelay.clear();
		for (const [port, relay] of relays) {
			relay.close();
			tcpPortManager.release(port);
		}
		relays.clear();
	});
}
