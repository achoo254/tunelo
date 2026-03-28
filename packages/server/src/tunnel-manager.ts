import type {
	ClientToServerEvents,
	ServerToClientEvents,
	TunnelRequest,
	TunnelResponse,
} from "@tunelo/shared";
import { DEFAULTS, ErrorCode } from "@tunelo/shared";
import type { Socket } from "socket.io";
import { createLogger } from "./logger.js";
import { checkBasicAuth, hashCredentials } from "./tunnel-auth-checker.js";

const logger = createLogger("tunelo-tunnel-manager");

interface PendingRequest {
	resolve: (res: TunnelResponse) => void;
	reject: (err: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

export interface TunnelConnection {
	socket: Socket<ClientToServerEvents, ServerToClientEvents>;
	apiKey: string;
	subdomain: string;
	connectedAt: Date;
	pendingRequests: Map<string, PendingRequest>;
	/** SHA-256 hash of "user:pass" for Basic Auth — undefined means no auth required */
	authHash?: string;
}

class TunnelManager {
	private tunnels = new Map<string, TunnelConnection>();
	/** Pending requests preserved during reconnect grace period */
	private orphanedRequests = new Map<string, Map<string, PendingRequest>>();
	/** Grace period timers — reject orphaned requests after timeout */
	private graceTimers = new Map<string, ReturnType<typeof setTimeout>>();

	register(
		subdomain: string,
		socket: Socket<ClientToServerEvents, ServerToClientEvents>,
		apiKey: string,
		auth?: string,
	): boolean {
		// If tunnel exists with a different socket, reject (subdomain taken)
		if (this.tunnels.has(subdomain)) return false;

		const authHash = auth ? hashCredentials(auth) : undefined;

		// Recover orphaned pending requests from a previous disconnect (grace period reconnect)
		const orphaned = this.orphanedRequests.get(subdomain);
		const pendingRequests = orphaned ?? new Map<string, PendingRequest>();

		if (orphaned) {
			// Clear grace timer — client reconnected in time
			const graceTimer = this.graceTimers.get(subdomain);
			if (graceTimer) clearTimeout(graceTimer);
			this.graceTimers.delete(subdomain);
			this.orphanedRequests.delete(subdomain);
			logger.info(
				{ subdomain, recoveredRequests: orphaned.size },
				"Recovered pending requests after reconnect",
			);
		}

		this.tunnels.set(subdomain, {
			socket,
			apiKey,
			subdomain,
			connectedAt: new Date(),
			pendingRequests,
			authHash,
		});

		logger.info(
			{ subdomain, recovered: orphaned?.size ?? 0 },
			"Tunnel registered",
		);
		return true;
	}

	unregister(subdomain: string): void {
		const tunnel = this.tunnels.get(subdomain);
		if (!tunnel) return;

		const pendingCount = tunnel.pendingRequests.size;
		this.tunnels.delete(subdomain);

		if (pendingCount > 0) {
			// Move pending requests to orphaned — give client time to reconnect
			this.orphanedRequests.set(subdomain, tunnel.pendingRequests);
			logger.info(
				{ subdomain, pendingCount },
				"Tunnel disconnected, grace period started",
			);

			const graceTimer = setTimeout(() => {
				const orphaned = this.orphanedRequests.get(subdomain);
				if (!orphaned) return;

				// Grace period expired — reject all orphaned requests
				for (const [id, pending] of orphaned) {
					clearTimeout(pending.timer);
					pending.reject(
						new Error(`Tunnel disconnected [${ErrorCode.TUNNEL_NOT_FOUND}]`),
					);
				}
				orphaned.clear();
				this.orphanedRequests.delete(subdomain);
				this.graceTimers.delete(subdomain);
				logger.info(
					{ subdomain, rejectedCount: pendingCount },
					"Grace period expired, requests rejected",
				);
			}, DEFAULTS.RECONNECT_GRACE_MS);

			this.graceTimers.set(subdomain, graceTimer);
		} else {
			logger.info({ subdomain }, "Tunnel unregistered");
		}
	}

	get(subdomain: string): TunnelConnection | undefined {
		return this.tunnels.get(subdomain);
	}

	has(subdomain: string): boolean {
		return this.tunnels.has(subdomain);
	}

	/** Unregister all subdomains associated with a specific socket */
	unregisterBySocket(socketId: string): void {
		const subdomains = this.getSubdomainsBySocket(socketId);
		for (const subdomain of subdomains) {
			this.unregister(subdomain);
		}
	}

	/** Get all subdomains registered on a specific socket */
	getSubdomainsBySocket(socketId: string): string[] {
		const subdomains: string[] = [];
		for (const [subdomain, tunnel] of this.tunnels) {
			if (tunnel.socket.id === socketId) subdomains.push(subdomain);
		}
		return subdomains;
	}

	/** Check if subdomain is in grace period (disconnected but waiting for reconnect) */
	isInGracePeriod(subdomain: string): boolean {
		return this.orphanedRequests.has(subdomain);
	}

	sendRequest(
		subdomain: string,
		request: TunnelRequest,
	): Promise<TunnelResponse> {
		const tunnel = this.tunnels.get(subdomain);
		if (!tunnel) return Promise.reject(new Error(`No tunnel for ${subdomain}`));

		return new Promise<TunnelResponse>((resolve, reject) => {
			const timer = setTimeout(() => {
				tunnel.pendingRequests.delete(request.id);
				// Also check orphaned requests
				const orphaned = this.orphanedRequests.get(subdomain);
				if (orphaned) orphaned.delete(request.id);
				reject(new Error(`Request timeout [${ErrorCode.REQUEST_TIMEOUT}]`));
			}, DEFAULTS.REQUEST_TIMEOUT_MS);

			tunnel.pendingRequests.set(request.id, { resolve, reject, timer });
			tunnel.socket.emit("request", request);
		});
	}

	/** Handle response from client — search all subdomains for this socket to find matching pending request */
	handleResponseBySocket(socketId: string, response: TunnelResponse): void {
		// Try all subdomains belonging to this socket
		for (const [subdomain, tunnel] of this.tunnels) {
			if (tunnel.socket.id !== socketId) continue;
			const pending = tunnel.pendingRequests.get(response.id);
			if (pending) {
				clearTimeout(pending.timer);
				tunnel.pendingRequests.delete(response.id);
				pending.resolve(response);
				return;
			}
		}
		// Also check orphaned requests across all subdomains
		for (const [, orphaned] of this.orphanedRequests) {
			const pending = orphaned.get(response.id);
			if (pending) {
				clearTimeout(pending.timer);
				orphaned.delete(response.id);
				pending.resolve(response);
				return;
			}
		}
	}

	/** Check if request passes Basic Auth for the given tunnel */
	checkAuth(subdomain: string, authHeader: string | undefined): boolean {
		const tunnel = this.tunnels.get(subdomain);
		return checkBasicAuth(tunnel?.authHash, authHeader);
	}

	getStats(): { activeTunnels: number; subdomains: string[] } {
		return {
			activeTunnels: this.tunnels.size,
			subdomains: [...this.tunnels.keys()],
		};
	}

	closeAll(): void {
		// Clear all grace timers
		for (const [, timer] of this.graceTimers) clearTimeout(timer);
		this.graceTimers.clear();

		// Reject all orphaned requests
		for (const [, orphaned] of this.orphanedRequests) {
			for (const [, pending] of orphaned) {
				clearTimeout(pending.timer);
				pending.reject(new Error("Server shutting down"));
			}
		}
		this.orphanedRequests.clear();

		for (const [subdomain, tunnel] of this.tunnels) {
			tunnel.socket.disconnect(true);
			this.unregister(subdomain);
		}
	}
}

export const tunnelManager = new TunnelManager();
