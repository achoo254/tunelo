/** Shared constants for tunnel protocol */

export const DEFAULTS = {
	SERVER_PORT: 3001,
	WS_PATH: "/tunnel",
	HEALTH_PATH: "/health",
	MAX_BODY_SIZE: 50 * 1024 * 1024,
	REQUEST_TIMEOUT_MS: 30_000,
	PING_INTERVAL_MS: 30_000,
	RECONNECT_BASE_MS: 1_000,
	RECONNECT_MAX_MS: 30_000,
	MAX_SUBDOMAIN_LENGTH: 63,
	/** Max WebSocket messages per second per connection */
	WS_RATE_LIMIT: 1000,
	/** Grace period (ms) to wait for client reconnect before rejecting pending requests */
	RECONNECT_GRACE_MS: 5_000,
	/** TCP tunnel port range start */
	TCP_PORT_MIN: 10_000,
	/** TCP tunnel port range end */
	TCP_PORT_MAX: 10_999,
	/** Max TCP tunnels per server */
	TCP_MAX_TUNNELS: 100,
	/** Max concurrent TCP connections per tunnel */
	TCP_MAX_CONNECTIONS_PER_TUNNEL: 50,
	/** TCP idle connection timeout (ms) — 10 minutes */
	TCP_IDLE_TIMEOUT_MS: 10 * 60 * 1000,
	/** Max new TCP connections per second per tunnel */
	TCP_CONNECT_RATE_LIMIT: 10,
} as const;

export const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export const TUNNEL_DOMAIN = "tunnel.inetdev.io.vn";

export function buildTunnelUrl(subdomain: string): string {
	return `https://${subdomain}.${TUNNEL_DOMAIN}`;
}

export function generateRequestId(): string {
	return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
