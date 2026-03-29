// Generic data-fetching hook with loading/error state and optional polling
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../api/client.js";

interface UseApiState<T> {
	data: T | null;
	loading: boolean;
	error: string | null;
}

interface UseApiReturn<T> extends UseApiState<T> {
	refetch: () => void;
}

interface UseApiOptions {
	/** Poll interval in ms. Omit or set to 0 to disable polling. */
	pollInterval?: number;
}

export function useApi<T>(
	path: string,
	options: UseApiOptions = {},
): UseApiReturn<T> {
	const [state, setState] = useState<UseApiState<T>>({
		data: null,
		loading: true,
		error: null,
	});

	const { pollInterval } = options;
	// Use ref to avoid stale closure issues with path/options
	const pathRef = useRef(path);
	pathRef.current = path;

	const fetchData = useCallback(async () => {
		try {
			const data = await apiFetch<T>(pathRef.current);
			setState({ data, loading: false, error: null });
		} catch (err) {
			const message = err instanceof Error ? err.message : "Request failed";
			setState((prev) => ({ ...prev, loading: false, error: message }));
		}
	}, []);

	// Initial fetch + optional polling
	// biome-ignore lint/correctness/useExhaustiveDependencies: path is intentionally listed to re-fetch when URL changes
	useEffect(() => {
		// Reset loading state when path changes
		setState({ data: null, loading: true, error: null });

		void fetchData();

		if (pollInterval && pollInterval > 0) {
			const id = setInterval(() => void fetchData(), pollInterval);
			return () => clearInterval(id);
		}

		return undefined;
	}, [path, pollInterval, fetchData]);

	return { ...state, refetch: fetchData };
}
