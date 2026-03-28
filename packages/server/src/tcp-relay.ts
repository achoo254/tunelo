/** TCP relay — creates a TCP server on allocated port and bridges data to/from WS client */

import { randomUUID } from "node:crypto";
import net from "node:net";
import {
	type ClientToServerEvents,
	DEFAULTS,
	type ServerToClientEvents,
} from "@tunelo/shared";
import type { Socket } from "socket.io";
import { createLogger } from "./logger.js";

const logger = createLogger("tunelo-tcp-relay");

interface TcpConnection {
	socket: net.Socket;
	connectionId: string;
	idleTimer: ReturnType<typeof setTimeout>;
}

export interface TcpRelay {
	remotePort: number;
	server: net.Server;
	/** Close the relay and all connections */
	close(): void;
	/** Forward data from WS client to a TCP connection */
	writeToConnection(connectionId: string, data: Buffer): void;
	/** Close a specific TCP connection */
	closeConnection(connectionId: string): void;
}

export function createTcpRelay(
	remotePort: number,
	wsSocket: Socket<ClientToServerEvents, ServerToClientEvents>,
	onConnection?: (connectionId: string) => void,
): TcpRelay {
	const connections = new Map<string, TcpConnection>();
	let connectCount = 0;
	const rateLimitReset = setInterval(() => {
		connectCount = 0;
	}, 1000);

	const server = net.createServer((tcpSocket) => {
		// Rate limit new connections
		connectCount++;
		if (connectCount > DEFAULTS.TCP_CONNECT_RATE_LIMIT) {
			logger.warn({ remotePort }, "TCP connection rate limit exceeded");
			tcpSocket.destroy();
			return;
		}

		// Max connections per tunnel
		if (connections.size >= DEFAULTS.TCP_MAX_CONNECTIONS_PER_TUNNEL) {
			logger.warn(
				{ remotePort, count: connections.size },
				"TCP max connections reached",
			);
			tcpSocket.destroy();
			return;
		}

		const connectionId = randomUUID();
		const sourceIp = tcpSocket.remoteAddress ?? "unknown";

		const resetIdle = (): ReturnType<typeof setTimeout> =>
			setTimeout(() => {
				logger.info(
					{ connectionId, remotePort },
					"TCP connection idle timeout",
				);
				tcpSocket.destroy();
			}, DEFAULTS.TCP_IDLE_TIMEOUT_MS);

		const conn: TcpConnection = {
			socket: tcpSocket,
			connectionId,
			idleTimer: resetIdle(),
		};
		connections.set(connectionId, conn);
		onConnection?.(connectionId);

		logger.info(
			{ connectionId, remotePort, sourceIp },
			"TCP connection opened",
		);

		// Notify client of new connection
		wsSocket.emit("tcp-connection-open", {
			type: "tcp-connection-open",
			connectionId,
			remotePort,
			sourceIp,
		});

		// Forward TCP data to WS client
		tcpSocket.on("data", (chunk: Buffer) => {
			clearTimeout(conn.idleTimer);
			conn.idleTimer = resetIdle();
			wsSocket.emit("tcp-data", {
				type: "tcp-data",
				connectionId,
				data: chunk.toString("base64"),
			});
		});

		tcpSocket.on("close", () => {
			clearTimeout(conn.idleTimer);
			connections.delete(connectionId);
			wsSocket.emit("tcp-connection-close", {
				type: "tcp-connection-close",
				connectionId,
			});
			logger.info({ connectionId, remotePort }, "TCP connection closed");
		});

		tcpSocket.on("error", (err) => {
			logger.error({ err, connectionId, remotePort }, "TCP connection error");
			tcpSocket.destroy();
		});
	});

	// TCP tunnels bind externally — nginx can't proxy raw TCP, firewall controls access
	server.listen(remotePort, "0.0.0.0", () => {
		logger.info({ remotePort }, "TCP relay listening");
	});

	server.on("error", (err) => {
		logger.error({ err, remotePort }, "TCP relay server error");
	});

	return {
		remotePort,
		server,
		close() {
			clearInterval(rateLimitReset);
			for (const [, conn] of connections) {
				clearTimeout(conn.idleTimer);
				conn.socket.destroy();
			}
			connections.clear();
			server.close();
			logger.info({ remotePort }, "TCP relay closed");
		},
		writeToConnection(connectionId: string, data: Buffer) {
			const conn = connections.get(connectionId);
			if (conn) {
				clearTimeout(conn.idleTimer);
				conn.idleTimer = setTimeout(() => {
					conn.socket.destroy();
				}, DEFAULTS.TCP_IDLE_TIMEOUT_MS);
				conn.socket.write(data);
			}
		},
		closeConnection(connectionId: string) {
			const conn = connections.get(connectionId);
			if (conn) {
				clearTimeout(conn.idleTimer);
				conn.socket.destroy();
				connections.delete(connectionId);
			}
		},
	};
}
