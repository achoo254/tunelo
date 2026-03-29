import { KeysTable } from "../components/keys-table.js";
// API keys management page — list all keys + revoke action
import { useApi } from "../hooks/use-api.js";
import type { KeysResponse } from "../types.js";

export function KeysPage(): React.ReactElement {
	const { data, loading, error, refetch } = useApi<KeysResponse>(
		"/api/admin/keys?limit=50",
	);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="text-xl font-semibold text-gray-800">API Keys</h2>
				{data && (
					<span className="text-sm text-gray-500">
						{data.total.toLocaleString()} total
					</span>
				)}
			</div>

			{loading && <p className="text-gray-400 text-sm">Loading keys…</p>}

			{error && (
				<div className="bg-red-50 border border-red-200 rounded px-4 py-3 text-sm text-red-700">
					<span>Failed to load keys: {error}</span>
					<button
						type="button"
						onClick={refetch}
						className="ml-3 underline hover:no-underline"
					>
						Retry
					</button>
				</div>
			)}

			{data && <KeysTable keys={data.keys} onRefetch={refetch} />}
		</div>
	);
}
