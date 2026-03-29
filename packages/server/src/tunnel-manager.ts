import type { TunnelRequest, TunnelResponse } from "@tunelo/shared";
import { DEFAULTS, ErrorCode } from "@tunelo/shared";
import type { WebSocket } from "ws";
import { createLogger } from "./logger.js";
import { checkBasicAuth, hashCredentials } from "./tunnel-auth-checker.js";
import { safeSend } from "./ws-send.js";

const logger = createLogger("tunelo-tunnel-manager");

interface PendingRequest {
	resolve: (res: TunnelResponse) => void;
	reject: (err: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

export interface TunnelConnection {
	socket: WebSocket;
	/** Unique connection ID for tracking across reconnects */
	connectionId: string;
	/** SHA-256 hash of the API key used to authenticate */
	apiKeyHash: string;
	/** User ID from KeyStore (MongoDB ObjectId or dev placeholder) */
	userId: string;
	/** API key ID from KeyStore */
	keyId: string;
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
		socket: WebSocket,
		connectionId: string,
		apiKeyHash: string,
		userId: string,
		keyId: string,
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
			connectionId,
			apiKeyHash,
			userId,
			keyId,
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

	/** Unregister all subdomains associated with a specific connection */
	unregisterByConnectionId(connectionId: string): void {
		const subdomains = this.getSubdomainsByConnectionId(connectionId);
		for (const subdomain of subdomains) {
			this.unregister(subdomain);
		}
	}

	/** Get all subdomains registered on a specific connection */
	getSubdomainsByConnectionId(connectionId: string): string[] {
		const subdomains: string[] = [];
		for (const [subdomain, tunnel] of this.tunnels) {
			if (tunnel.connectionId === connectionId) subdomains.push(subdomain);
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
			safeSend(tunnel.socket, request);
		});
	}

	/** Handle response from client — search all subdomains for this connection to find matching pending request */
	handleResponseByConnectionId(
		connectionId: string,
		response: TunnelResponse,
	): void {
		// Try all subdomains belonging to this connection
		for (const [subdomain, tunnel] of this.tunnels) {
			if (tunnel.connectionId !== connectionId) continue;
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

	/** Count active tunnels using a specific API key hash */
	countByKeyHash(keyHash: string): number {
		let count = 0;
		for (const tunnel of this.tunnels.values()) {
			if (tunnel.apiKeyHash === keyHash) count++;
		}
		return count;
	}

	/** Count active tunnels for a specific user */
	countByUserId(userId: string): number {
		let count = 0;
		for (const tunnel of this.tunnels.values()) {
			if (tunnel.userId === userId) count++;
		}
		return count;
	}

	/** Disconnect and unregister all tunnels using a specific API key hash */
	disconnectByKeyHash(keyHash: string): void {
		const subdomains: string[] = [];
		for (const [subdomain, tunnel] of this.tunnels) {
			if (tunnel.apiKeyHash === keyHash) subdomains.push(subdomain);
		}
		for (const subdomain of subdomains) {
			const tunnel = this.tunnels.get(subdomain);
			if (tunnel) tunnel.socket.close();
			this.unregister(subdomain);
		}
		if (subdomains.length > 0) {
			logger.info(
				{ keyHash: keyHash.slice(0, 8), count: subdomains.length },
				"Disconnected tunnels by key hash",
			);
		}
	}

	/** Get all active tunnel connections (for admin API) */
	getAllConnections(): TunnelConnection[] {
		return [...this.tunnels.values()];
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
			tunnel.socket.close();
			this.unregister(subdomain);
		}
	}
}

export const tunnelManager = new TunnelManager();
