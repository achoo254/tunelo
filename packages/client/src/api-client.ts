/**
 * HTTP client for Tunelo server auth & key management API.
 * Used by CLI commands (register, login, keys).
 */

interface ApiErrorResponse {
	error?: { code: string; message: string };
}

export class ApiClientError extends Error {
	constructor(
		public code: string,
		message: string,
		public statusCode: number,
	) {
		super(message);
		this.name = "ApiClientError";
	}
}

/** Derives HTTP API base URL from WS server URL */
export function getApiBaseUrl(serverUrl: string): string {
	return serverUrl
		.replace(/^wss:\/\//, "https://")
		.replace(/^ws:\/\//, "http://")
		.replace(/\/$/, "");
}

async function request<T>(
	baseUrl: string,
	path: string,
	options: {
		method?: string;
		body?: Record<string, unknown>;
		apiKey?: string;
	} = {},
): Promise<T> {
	const url = `${baseUrl}/api${path}`;
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (options.apiKey) {
		headers.Authorization = `Bearer ${options.apiKey}`;
	}

	const res = await fetch(url, {
		method: options.method ?? "GET",
		headers,
		body: options.body ? JSON.stringify(options.body) : undefined,
	});

	const text = await res.text();
	let data: T & ApiErrorResponse;
	try {
		data = JSON.parse(text) as T & ApiErrorResponse;
	} catch {
		if (!res.ok) {
			throw new ApiClientError(
				"TUNELO_UNKNOWN",
				text || `HTTP ${res.status}`,
				res.status,
			);
		}
		throw new ApiClientError(
			"TUNELO_UNKNOWN",
			`Invalid JSON response: ${text.slice(0, 100)}`,
			res.status,
		);
	}

	if (!res.ok) {
		const code = data.error?.code ?? "TUNELO_UNKNOWN";
		const message = data.error?.message ?? `HTTP ${res.status}`;
		throw new ApiClientError(code, message, res.status);
	}

	return data;
}

// --- Auth endpoints ---

export interface SignupResult {
	userId: string;
	requireTotp: boolean;
	qrDataUrl?: string;
	totpSecret?: string;
}

export async function signup(
	baseUrl: string,
	email: string,
	password: string,
): Promise<SignupResult> {
	return request<SignupResult>(baseUrl, "/auth/signup", {
		method: "POST",
		body: { email, password },
	});
}

export interface VerifyTotpResult {
	success: boolean;
}

export async function verifyTotp(
	baseUrl: string,
	userId: string,
	totpCode: string,
): Promise<VerifyTotpResult> {
	return request<VerifyTotpResult>(baseUrl, "/auth/verify-totp", {
		method: "POST",
		body: { userId, totpCode },
	});
}

export interface LoginCliResult {
	userId: string;
	role: string;
	key: string;
	keyPrefix: string;
}

export async function loginCli(
	baseUrl: string,
	email: string,
	password: string,
	totpCode?: string,
	keyLabel?: string,
): Promise<LoginCliResult> {
	const body: Record<string, unknown> = { email, password };
	if (totpCode) body.totpCode = totpCode;
	if (keyLabel) body.keyLabel = keyLabel;
	return request<LoginCliResult>(baseUrl, "/auth/login-cli", {
		method: "POST",
		body,
	});
}

// --- Key endpoints (authenticated via Bearer API key) ---

export interface KeyInfo {
	id: string;
	keyPrefix: string;
	label: string;
	status: string;
	createdAt: string;
	lastUsedAt: string | null;
}

export async function listKeys(
	baseUrl: string,
	apiKey: string,
): Promise<KeyInfo[]> {
	const data = await request<{ keys: KeyInfo[] }>(baseUrl, "/keys", {
		apiKey,
	});
	return data.keys;
}

export interface CreateKeyResult {
	id: string;
	key: string;
	keyPrefix: string;
}

export async function createKey(
	baseUrl: string,
	apiKey: string,
	label?: string,
): Promise<CreateKeyResult> {
	return request<CreateKeyResult>(baseUrl, "/keys", {
		method: "POST",
		body: { label },
		apiKey,
	});
}

export async function revokeKey(
	baseUrl: string,
	apiKey: string,
	keyId: string,
): Promise<void> {
	await request(baseUrl, `/keys/${keyId}`, {
		method: "DELETE",
		apiKey,
	});
}

// --- Device Code Auth endpoints ---

export interface DeviceCodeResult {
	deviceCode: string;
	userCode: string;
	verificationUrl: string;
	expiresIn: number;
}

export async function createDeviceCode(
	baseUrl: string,
): Promise<DeviceCodeResult> {
	return request<DeviceCodeResult>(baseUrl, "/auth/device", {
		method: "POST",
	});
}

export interface DevicePollResult {
	status: "pending" | "approved" | "expired";
	key?: string;
	keyPrefix?: string;
	userId?: string;
	email?: string;
}

export async function pollDeviceCode(
	baseUrl: string,
	deviceCode: string,
): Promise<DevicePollResult> {
	return request<DevicePollResult>(baseUrl, "/auth/device/poll", {
		method: "POST",
		body: { deviceCode },
	});
}
