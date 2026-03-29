import { StatsCards } from "../components/stats-cards.js";
// Overview page — system stats summary
import { useApi } from "../hooks/use-api.js";
import type { SystemStats } from "../types.js";

export function OverviewPage(): React.ReactElement {
	const { data, loading, error, refetch } =
		useApi<SystemStats>("/api/admin/stats");

	if (loading) {
		return <p className="text-gray-400 text-sm">Loading stats…</p>;
	}

	if (error) {
		return (
			<div className="bg-red-50 border border-red-200 rounded px-4 py-3 text-sm text-red-700">
				<span>Failed to load stats: {error}</span>
				<button
					type="button"
					onClick={refetch}
					className="ml-3 underline hover:no-underline"
				>
					Retry
				</button>
			</div>
		);
	}

	if (!data) return <></>;

	return (
		<div className="space-y-6">
			<h2 className="text-xl font-semibold text-gray-800">System Overview</h2>
			<StatsCards stats={data} />
		</div>
	);
}
