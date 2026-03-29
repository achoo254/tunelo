import { TunnelsList } from "../components/tunnels-list.js";
// Active tunnels page — polls every 10 seconds
import { useApi } from "../hooks/use-api.js";
import type { TunnelsResponse } from "../types.js";

const POLL_INTERVAL_MS = 10_000;

export function TunnelsPage(): React.ReactElement {
	const { data, loading, error, refetch } = useApi<TunnelsResponse>(
		"/api/admin/tunnels",
		{ pollInterval: POLL_INTERVAL_MS },
	);

	const count = data?.tunnels.length ?? 0;

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="text-xl font-semibold text-gray-800">Active Tunnels</h2>
				<div className="flex items-center gap-3">
					{data && <span className="text-sm text-gray-500">{count} live</span>}
					<span className="text-xs text-gray-400">
						Auto-refreshes every 10s
					</span>
					<button
						type="button"
						onClick={refetch}
						className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
					>
						Refresh
					</button>
				</div>
			</div>

			{loading && !data && (
				<p className="text-gray-400 text-sm">Loading tunnels…</p>
			)}

			{error && (
				<div className="bg-red-50 border border-red-200 rounded px-4 py-3 text-sm text-red-700">
					<span>Failed to load tunnels: {error}</span>
					<button
						type="button"
						onClick={refetch}
						className="ml-3 underline hover:no-underline"
					>
						Retry
					</button>
				</div>
			)}

			{data && <TunnelsList tunnels={data.tunnels} />}
		</div>
	);
}
