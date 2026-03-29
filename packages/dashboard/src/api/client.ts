// Fetch wrapper — sends cookies automatically, attaches CSRF token for mutations
// Redirects to /dashboard/login on 401

let csrfToken: string | null = null;

async function fetchCsrfToken(): Promise<string> {
	const res = await fetch("/api/auth/csrf-token", {
		credentials: "include",
	});
	if (!res.ok) throw new Error("Failed to fetch CSRF token");
	const data = (await res.json()) as { csrfToken: string };
	return data.csrfToken;
}

async function getCsrfToken(): Promise<string> {
	if (!csrfToken) {
		csrfToken = await fetchCsrfToken();
	}
	return csrfToken;
}

// Invalidate cached token (e.g. after 403 CSRF error)
export function invalidateCsrfToken(): void {
	csrfToken = null;
}

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function apiFetch<T>(
	path: string,
	options: RequestInit = {},
): Promise<T> {
	const method = (options.method ?? "GET").toUpperCase();
	const headers = new Headers(options.headers);

	headers.set("Content-Type", "application/json");

	if (MUTATION_METHODS.has(method)) {
		const token = await getCsrfToken();
		headers.set("X-CSRF-Token", token);
	}

	const res = await fetch(path, {
		...options,
		credentials: "include",
		headers,
	});

	if (res.status === 401) {
		// Only redirect if not already on login page (avoids redirect loop)
		const authPages = ["/dashboard/login", "/dashboard/signup"];
		if (!authPages.some((p) => window.location.pathname.startsWith(p))) {
			window.location.href = "/dashboard/login";
			return new Promise(() => undefined);
		}
		throw new Error("Not authenticated");
	}

	if (res.status === 403) {
		// Possibly stale CSRF token — invalidate and let caller retry
		invalidateCsrfToken();
	}

	if (!res.ok) {
		let message = `HTTP ${res.status}`;
		try {
			const body = (await res.json()) as { error?: { message?: string } };
			message = body.error?.message ?? message;
		} catch {
			// ignore parse error
		}
		throw new Error(message);
	}

	// Handle 204 No Content
	if (res.status === 204) {
		return undefined as T;
	}

	return res.json() as Promise<T>;
}
