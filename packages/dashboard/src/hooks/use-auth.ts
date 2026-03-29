// Auth hook — login/logout + current user state via GET /api/profile
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";

export interface AuthUser {
	id: string;
	email: string;
	role: "user" | "admin";
	status: string;
	plan: string;
}

interface AuthState {
	user: AuthUser | null;
	loading: boolean;
	error: string | null;
}

interface LoginParams {
	email: string;
	password: string;
	totpCode: string;
}

interface UseAuthReturn extends AuthState {
	login: (params: LoginParams) => Promise<void>;
	logout: () => Promise<void>;
	isAuthenticated: boolean;
}

export function useAuth(): UseAuthReturn {
	const [state, setState] = useState<AuthState>({
		user: null,
		loading: true,
		error: null,
	});

	// Check session on mount
	useEffect(() => {
		let cancelled = false;

		apiFetch<AuthUser>("/api/profile")
			.then((user) => {
				if (!cancelled) setState({ user, loading: false, error: null });
			})
			.catch(() => {
				// 401 will redirect via apiFetch; other errors mean not authenticated
				if (!cancelled) setState({ user: null, loading: false, error: null });
			});

		return () => {
			cancelled = true;
		};
	}, []);

	const login = useCallback(async (params: LoginParams): Promise<void> => {
		setState((prev) => ({ ...prev, loading: true, error: null }));
		try {
			await apiFetch("/api/auth/login", {
				method: "POST",
				body: JSON.stringify({
					email: params.email,
					password: params.password,
					totpCode: params.totpCode,
				}),
			});
			// Fetch profile after successful login
			const user = await apiFetch<AuthUser>("/api/profile");
			setState({ user, loading: false, error: null });
		} catch (err) {
			const message = err instanceof Error ? err.message : "Login failed";
			setState({ user: null, loading: false, error: message });
			throw err;
		}
	}, []);

	const logout = useCallback(async (): Promise<void> => {
		try {
			await apiFetch("/api/auth/logout", { method: "POST" });
		} finally {
			setState({ user: null, loading: false, error: null });
			window.location.href = "/dashboard/login"; // full path since window.location ignores basename
		}
	}, []);

	return {
		...state,
		isAuthenticated: state.user !== null,
		login,
		logout,
	};
}
