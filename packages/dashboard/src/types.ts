// Shared API response types for dashboard

export interface User {
	id: string;
	email: string;
	role: "user" | "admin";
	status: "active" | "suspended";
	plan: string;
	createdAt: string;
}

export interface ApiKey {
	id: string;
	keyPrefix: string;
	label: string;
	userEmail: string;
	userId: string;
	status: "active" | "revoked";
	createdAt: string;
	lastUsedAt: string | null;
}

export interface ActiveTunnel {
	subdomain: string;
	userId: string;
	keyId: string;
	connectedAt: string;
	requestCount: number;
}

export interface UsageDataPoint {
	date: string;
	requestCount: number;
	bytesIn: number;
	bytesOut: number;
}

export interface SystemStats {
	totalUsers: number;
	activeKeys: number;
	liveTunnels: number;
	requestsToday: number;
}

export interface PaginatedResponse<T> {
	items: T[];
	total: number;
	page: number;
	limit: number;
}

export interface UsersResponse {
	users: User[];
	total: number;
	page: number;
	limit: number;
}

export interface KeysResponse {
	keys: ApiKey[];
	total: number;
	page: number;
	limit: number;
}

export interface TunnelsResponse {
	tunnels: ActiveTunnel[];
}

export interface UsageResponse {
	usage: UsageDataPoint[];
}
