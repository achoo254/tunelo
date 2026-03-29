import { UsersTable } from "../components/users-table.js";
// Users management page — list + suspend/activate actions
import { useApi } from "../hooks/use-api.js";
import type { UsersResponse } from "../types.js";

export function UsersPage(): React.ReactElement {
	const { data, loading, error, refetch } = useApi<UsersResponse>(
		"/api/admin/users?limit=50",
	);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="text-xl font-semibold text-gray-800">Users</h2>
				{data && (
					<span className="text-sm text-gray-500">
						{data.total.toLocaleString()} total
					</span>
				)}
			</div>

			{loading && <p className="text-gray-400 text-sm">Loading users…</p>}

			{error && (
				<div className="bg-red-50 border border-red-200 rounded px-4 py-3 text-sm text-red-700">
					<span>Failed to load users: {error}</span>
					<button
						type="button"
						onClick={refetch}
						className="ml-3 underline hover:no-underline"
					>
						Retry
					</button>
				</div>
			)}

			{data && <UsersTable users={data.users} onRefetch={refetch} />}
		</div>
	);
}
