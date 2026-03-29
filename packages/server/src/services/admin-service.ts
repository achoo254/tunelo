import { TuneloError } from "../api/middleware/error-handler.js";
import { ApiKey } from "../db/models/api-key-model.js";
import { User } from "../db/models/user-model.js";
import { tunnelManager } from "../tunnel-manager.js";

export async function listUsers(page: number, limit: number) {
	const skip = (page - 1) * limit;
	const [users, total] = await Promise.all([
		User.find()
			.select("-passwordHash -totpSecret")
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(limit)
			.lean(),
		User.countDocuments(),
	]);

	return {
		users: users.map((u) => ({
			id: String(u._id),
			email: u.email,
			role: u.role,
			status: u.status,
			plan: u.plan,
			createdAt: u.createdAt,
		})),
		total,
		page,
		pages: Math.ceil(total / limit),
	};
}

export async function updateUserStatus(
	userId: string,
	status: "active" | "suspended",
) {
	const user = await User.findById(userId);
	if (!user) {
		throw new TuneloError("TUNELO_AUTH_001", "User not found", 404);
	}
	user.status = status;
	await user.save();
	return { id: String(user._id), status: user.status };
}

export async function listAllKeys(page: number, limit: number) {
	const skip = (page - 1) * limit;
	const [keys, total] = await Promise.all([
		ApiKey.find()
			.select("-keyHash")
			.populate("userId", "email")
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(limit)
			.lean(),
		ApiKey.countDocuments(),
	]);

	return {
		keys: keys.map((k) => ({
			id: String(k._id),
			keyPrefix: k.keyPrefix,
			label: k.label,
			status: k.status,
			userEmail: (k.userId as unknown as { email: string })?.email ?? "unknown",
			createdAt: k.createdAt,
		})),
		total,
		page,
		pages: Math.ceil(total / limit),
	};
}

export async function revokeAnyKey(keyId: string) {
	const apiKey = await ApiKey.findById(keyId);
	if (!apiKey) {
		throw new TuneloError("TUNELO_KEY_002", "API key not found", 404);
	}
	apiKey.status = "revoked";
	await apiKey.save();
	tunnelManager.disconnectByKeyHash(apiKey.keyHash);
	return { id: String(apiKey._id), status: "revoked" };
}

export function getActiveTunnels() {
	const connections = tunnelManager.getAllConnections();
	return connections.map((c) => ({
		subdomain: c.subdomain,
		userId: c.userId,
		keyId: c.keyId,
		connectedAt: c.connectedAt,
	}));
}

export async function getSystemStats() {
	const [userCount, keyCount] = await Promise.all([
		User.countDocuments(),
		ApiKey.countDocuments({ status: "active" }),
	]);
	const stats = tunnelManager.getStats();

	return {
		totalUsers: userCount,
		activeKeys: keyCount,
		liveTunnels: stats.activeTunnels,
		requestsToday: 0, // TODO: implement daily request counter
	};
}
