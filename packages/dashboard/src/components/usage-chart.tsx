// Line chart showing request volume over last 30 days using recharts
import {
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { UsageDataPoint } from "../types.js";

interface UsageChartProps {
	data: UsageDataPoint[];
}

function formatDate(dateStr: string): string {
	const d = new Date(dateStr);
	return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function UsageChart({ data }: UsageChartProps): React.ReactElement {
	const chartData = data.map((point) => ({
		date: formatDate(point.date),
		requests: point.requestCount,
		bandwidthKB: Math.round((point.bytesIn + point.bytesOut) / 1024),
	}));

	return (
		<div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
			<h3 className="text-sm font-semibold text-gray-700 mb-4">
				Requests — Last 30 Days
			</h3>
			<ResponsiveContainer width="100%" height={300}>
				<LineChart
					data={chartData}
					margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
				>
					<CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
					<XAxis
						dataKey="date"
						tick={{ fontSize: 11, fill: "#9ca3af" }}
						tickLine={false}
						axisLine={{ stroke: "#e5e7eb" }}
					/>
					<YAxis
						yAxisId="requests"
						tick={{ fontSize: 11, fill: "#9ca3af" }}
						tickLine={false}
						axisLine={false}
						tickFormatter={(v: number) =>
							v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
						}
					/>
					<YAxis
						yAxisId="bandwidth"
						orientation="right"
						tick={{ fontSize: 11, fill: "#9ca3af" }}
						tickLine={false}
						axisLine={false}
						tickFormatter={(v: number) => `${v}KB`}
					/>
					<Tooltip
						contentStyle={{ fontSize: 12, borderColor: "#e5e7eb" }}
						formatter={(value: number, name: string) => {
							if (name === "bandwidthKB") return [`${value} KB`, "Bandwidth"];
							return [value.toLocaleString(), "Requests"];
						}}
					/>
					<Legend
						formatter={(value: string) =>
							value === "bandwidthKB" ? "Bandwidth (KB)" : "Requests"
						}
					/>
					<Line
						yAxisId="requests"
						type="monotone"
						dataKey="requests"
						stroke="#6366f1"
						strokeWidth={2}
						dot={false}
						activeDot={{ r: 4 }}
					/>
					<Line
						yAxisId="bandwidth"
						type="monotone"
						dataKey="bandwidthKB"
						stroke="#10b981"
						strokeWidth={2}
						dot={false}
						activeDot={{ r: 4 }}
					/>
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}
