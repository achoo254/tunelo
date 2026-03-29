// Active tunnels list — shows live connected tunnels
import type { ActiveTunnel } from "../types.js";

interface TunnelsListProps {
	tunnels: ActiveTunnel[];
}

function formatDuration(connectedAt: string): string {
	const ms = Date.now() - new Date(connectedAt).getTime();
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h ${minutes % 60}m`;
}

export function TunnelsList({ tunnels }: TunnelsListProps): React.ReactElement {
	return (
		<div className="overflow-x-auto rounded-lg border border-gray-200">
			<table className="min-w-full text-sm">
				<thead className="bg-gray-50 border-b border-gray-200">
					<tr>
						{["Subdomain", "User ID", "Connected", "Duration", "Requests"].map(
							(h) => (
								<th
									key={h}
									className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
								>
									{h}
								</th>
							),
						)}
					</tr>
				</thead>
				<tbody className="bg-white divide-y divide-gray-100">
					{tunnels.map((tunnel) => (
						<tr key={tunnel.subdomain} className="hover:bg-gray-50">
							<td className="px-4 py-3 font-mono text-indigo-700 font-medium">
								{tunnel.subdomain}
							</td>
							<td className="px-4 py-3 font-mono text-gray-500 text-xs">
								{tunnel.userId}
							</td>
							<td className="px-4 py-3 text-gray-600">
								{new Date(tunnel.connectedAt).toLocaleTimeString()}
							</td>
							<td className="px-4 py-3 text-gray-600">
								{formatDuration(tunnel.connectedAt)}
							</td>
							<td className="px-4 py-3 text-gray-600">
								{tunnel.requestCount.toLocaleString()}
							</td>
						</tr>
					))}
					{tunnels.length === 0 && (
						<tr>
							<td colSpan={5} className="px-4 py-8 text-center text-gray-400">
								No active tunnels.
							</td>
						</tr>
					)}
				</tbody>
			</table>
		</div>
	);
}
