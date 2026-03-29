// Summary stat cards shown on overview page
import type { SystemStats } from "../types.js";

interface StatCardProps {
	label: string;
	value: number | string;
	description: string;
}

function StatCard({
	label,
	value,
	description,
}: StatCardProps): React.ReactElement {
	return (
		<div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
			<p className="text-sm font-medium text-gray-500">{label}</p>
			<p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
			<p className="mt-1 text-xs text-gray-400">{description}</p>
		</div>
	);
}

interface StatsCardsProps {
	stats: SystemStats;
}

export function StatsCards({ stats }: StatsCardsProps): React.ReactElement {
	return (
		<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
			<StatCard
				label="Total Users"
				value={stats.totalUsers.toLocaleString()}
				description="Registered accounts"
			/>
			<StatCard
				label="Active Keys"
				value={stats.activeKeys.toLocaleString()}
				description="Non-revoked API keys"
			/>
			<StatCard
				label="Live Tunnels"
				value={stats.liveTunnels.toLocaleString()}
				description="Currently connected"
			/>
			<StatCard
				label="Requests Today"
				value={stats.requestsToday.toLocaleString()}
				description="HTTP requests relayed"
			/>
		</div>
	);
}
