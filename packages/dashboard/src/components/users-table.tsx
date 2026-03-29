// Users table with suspend/activate actions
import { useState } from "react";
import { apiFetch } from "../api/client.js";
import type { User } from "../types.js";

interface UsersTableProps {
	users: User[];
	onRefetch: () => void;
}

function StatusBadge({
	status,
}: { status: User["status"] }): React.ReactElement {
	const cls =
		status === "active"
			? "bg-green-100 text-green-800"
			: "bg-red-100 text-red-800";
	return (
		<span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
			{status}
		</span>
	);
}

export function UsersTable({
	users,
	onRefetch,
}: UsersTableProps): React.ReactElement {
	const [pending, setPending] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function toggleStatus(user: User): Promise<void> {
		const nextStatus = user.status === "active" ? "suspended" : "active";
		setPending(user.id);
		setError(null);
		try {
			await apiFetch(`/api/admin/users/${user.id}`, {
				method: "PATCH",
				body: JSON.stringify({ status: nextStatus }),
			});
			onRefetch();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Action failed");
		} finally {
			setPending(null);
		}
	}

	return (
		<div>
			{error && (
				<p className="mb-3 text-sm text-red-600 bg-red-50 rounded px-3 py-2">
					{error}
				</p>
			)}
			<div className="overflow-x-auto rounded-lg border border-gray-200">
				<table className="min-w-full text-sm">
					<thead className="bg-gray-50 border-b border-gray-200">
						<tr>
							{["Email", "Role", "Plan", "Status", "Created", "Actions"].map(
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
						{users.map((user) => (
							<tr key={user.id} className="hover:bg-gray-50">
								<td className="px-4 py-3 font-medium text-gray-900">
									{user.email}
								</td>
								<td className="px-4 py-3 text-gray-600 capitalize">
									{user.role}
								</td>
								<td className="px-4 py-3 text-gray-600">{user.plan}</td>
								<td className="px-4 py-3">
									<StatusBadge status={user.status} />
								</td>
								<td className="px-4 py-3 text-gray-500">
									{new Date(user.createdAt).toLocaleDateString()}
								</td>
								<td className="px-4 py-3">
									{user.role !== "admin" && (
										<button
											type="button"
											disabled={pending === user.id}
											onClick={() => void toggleStatus(user)}
											className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
												user.status === "active"
													? "bg-red-50 text-red-700 hover:bg-red-100"
													: "bg-green-50 text-green-700 hover:bg-green-100"
											} disabled:opacity-50`}
										>
											{pending === user.id
												? "..."
												: user.status === "active"
													? "Suspend"
													: "Activate"}
										</button>
									)}
								</td>
							</tr>
						))}
						{users.length === 0 && (
							<tr>
								<td colSpan={6} className="px-4 py-8 text-center text-gray-400">
									No users found.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
