// API keys table with revoke action
import { useState } from "react";
import { apiFetch } from "../api/client.js";
import type { ApiKey } from "../types.js";

interface KeysTableProps {
	keys: ApiKey[];
	onRefetch: () => void;
}

function StatusBadge({
	status,
}: { status: ApiKey["status"] }): React.ReactElement {
	const cls =
		status === "active"
			? "bg-green-100 text-green-800"
			: "bg-gray-100 text-gray-500";
	return (
		<span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
			{status}
		</span>
	);
}

export function KeysTable({
	keys,
	onRefetch,
}: KeysTableProps): React.ReactElement {
	const [pending, setPending] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function revokeKey(keyId: string): Promise<void> {
		if (!confirm("Revoke this API key? This cannot be undone.")) return;
		setPending(keyId);
		setError(null);
		try {
			await apiFetch(`/api/admin/keys/${keyId}`, { method: "DELETE" });
			onRefetch();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Revoke failed");
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
							{[
								"Prefix",
								"Label",
								"Owner",
								"Status",
								"Last Used",
								"Actions",
							].map((h) => (
								<th
									key={h}
									className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
								>
									{h}
								</th>
							))}
						</tr>
					</thead>
					<tbody className="bg-white divide-y divide-gray-100">
						{keys.map((key) => (
							<tr key={key.id} className="hover:bg-gray-50">
								<td className="px-4 py-3 font-mono text-gray-800">
									{key.keyPrefix}…
								</td>
								<td className="px-4 py-3 text-gray-600">{key.label || "—"}</td>
								<td className="px-4 py-3 text-gray-600">{key.userEmail}</td>
								<td className="px-4 py-3">
									<StatusBadge status={key.status} />
								</td>
								<td className="px-4 py-3 text-gray-500">
									{key.lastUsedAt
										? new Date(key.lastUsedAt).toLocaleDateString()
										: "Never"}
								</td>
								<td className="px-4 py-3">
									{key.status === "active" && (
										<button
											type="button"
											disabled={pending === key.id}
											onClick={() => void revokeKey(key.id)}
											className="px-2 py-1 rounded text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
										>
											{pending === key.id ? "..." : "Revoke"}
										</button>
									)}
								</td>
							</tr>
						))}
						{keys.length === 0 && (
							<tr>
								<td colSpan={6} className="px-4 py-8 text-center text-gray-400">
									No API keys found.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
