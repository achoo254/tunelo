/** Manages allocation/deallocation of TCP ports for TCP tunnels */

import { DEFAULTS } from "@tunelo/shared";
import { createLogger } from "./logger.js";

const logger = createLogger("tunelo-tcp-port-manager");

interface PortAllocation {
	port: number;
	socketId: string;
	localPort: number;
	allocatedAt: Date;
}

class TcpPortManager {
	private allocated = new Map<number, PortAllocation>();
	private portMin: number;
	private portMax: number;

	constructor() {
		const range = process.env.TCP_PORT_RANGE;
		if (range) {
			const [min, max] = range.split("-").map(Number);
			this.portMin = min || DEFAULTS.TCP_PORT_MIN;
			this.portMax = max || DEFAULTS.TCP_PORT_MAX;
		} else {
			this.portMin = DEFAULTS.TCP_PORT_MIN;
			this.portMax = DEFAULTS.TCP_PORT_MAX;
		}
		logger.info(
			{ portMin: this.portMin, portMax: this.portMax },
			"TCP port range configured",
		);
	}

	/** Allocate a port. Returns port number or null if no ports available. */
	allocate(
		socketId: string,
		localPort: number,
		preferred?: number,
	): number | null {
		if (this.allocated.size >= DEFAULTS.TCP_MAX_TUNNELS) {
			logger.warn(
				{ allocated: this.allocated.size },
				"TCP tunnel limit reached",
			);
			return null;
		}

		// Try preferred port first
		if (
			preferred &&
			preferred >= this.portMin &&
			preferred <= this.portMax &&
			!this.allocated.has(preferred)
		) {
			this.allocated.set(preferred, {
				port: preferred,
				socketId,
				localPort,
				allocatedAt: new Date(),
			});
			logger.info(
				{ port: preferred, socketId, localPort },
				"TCP port allocated (preferred)",
			);
			return preferred;
		}

		// Find first available port
		for (let port = this.portMin; port <= this.portMax; port++) {
			if (!this.allocated.has(port)) {
				this.allocated.set(port, {
					port,
					socketId,
					localPort,
					allocatedAt: new Date(),
				});
				logger.info({ port, socketId, localPort }, "TCP port allocated");
				return port;
			}
		}

		logger.warn("No TCP ports available in range");
		return null;
	}

	/** Release a specific port */
	release(port: number): void {
		if (this.allocated.delete(port)) {
			logger.info({ port }, "TCP port released");
		}
	}

	/** Release all ports for a given socket */
	releaseBySocket(socketId: string): number[] {
		const released: number[] = [];
		for (const [port, alloc] of this.allocated) {
			if (alloc.socketId === socketId) {
				this.allocated.delete(port);
				released.push(port);
			}
		}
		if (released.length > 0) {
			logger.info(
				{ socketId, ports: released },
				"TCP ports released for socket",
			);
		}
		return released;
	}

	/** Get all ports allocated for a socket */
	getBySocket(socketId: string): PortAllocation[] {
		const result: PortAllocation[] = [];
		for (const alloc of this.allocated.values()) {
			if (alloc.socketId === socketId) result.push(alloc);
		}
		return result;
	}

	get stats(): { allocated: number; total: number } {
		return {
			allocated: this.allocated.size,
			total: this.portMax - this.portMin + 1,
		};
	}
}

export const tcpPortManager = new TcpPortManager();
