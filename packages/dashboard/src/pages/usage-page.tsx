import { UsageChart } from "../components/usage-chart.js";
// Usage analytics page — last 30 days request/bandwidth chart
import { useApi } from "../hooks/use-api.js";
import type { UsageResponse } from "../types.js";

export function UsagePage(): React.ReactElement {
	const { data, loading, error, refetch } = useApi<UsageResponse>(
		"/api/admin/usage?days=30",
	);

	return (
		<div className="space-y-4">
			<h2 className="text-xl font-semibold text-gray-800">Usage Analytics</h2>

			{loading && <p className="text-gray-400 text-sm">Loading usage data…</p>}

			{error && (
				<div className="bg-red-50 border border-red-200 rounded px-4 py-3 text-sm text-red-700">
					<span>Failed to load usage: {error}</span>
					<button
						type="button"
						onClick={refetch}
						className="ml-3 underline hover:no-underline"
					>
						Retry
					</button>
				</div>
			)}

			{data && data.usage.length > 0 && <UsageChart data={data.usage} />}

			{data && data.usage.length === 0 && (
				<p className="text-gray-400 text-sm">No usage data available yet.</p>
			)}
		</div>
	);
}
