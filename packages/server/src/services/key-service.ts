import { createHash } from "node:crypto";
import { customAlphabet } from "nanoid";
import { TuneloError } from "../api/middleware/error-handler.js";
import { ApiKey } from "../db/models/api-key-model.js";
import { User } from "../db/models/user-model.js";
import { tunnelManager } from "../tunnel-manager.js";

const generateKeyId = customAlphabet(
	"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
	32,
);

const KEY_PREFIX = "tunelo_";

function hashKey(key: string): string {
	return createHash("sha256").update(key).digest("hex");
}

export async function listKeys(userId: string): Promise<
	Array<{
		id: string;
		keyPrefix: string;
		label: string;
		status: string;
		createdAt: Date;
		lastUsedAt: Date | null;
	}>
> {
	const keys = await ApiKey.find({ userId, status: "active" })
		.select("-keyHash")
		.lean();

	return keys.map((k) => ({
		id: String(k._id),
		keyPrefix: k.keyPrefix ?? "",
		label: k.label ?? "Default",
		status: k.status ?? "active",
		createdAt: k.createdAt as unknown as Date,
		lastUsedAt: k.lastUsedAt ?? null,
	}));
}

export async function createKey(
	userId: string,
	label?: string,
): Promise<{ id: string; key: string; keyPrefix: string }> {
	const user = await User.findById(userId).lean();
	if (!user) {
		throw new TuneloError("TUNELO_AUTH_001", "User not found", 404);
	}

	const maxKeys = user.limits?.maxKeys ?? 5;
	const count = await ApiKey.countDocuments({ userId, status: "active" });
	if (count >= maxKeys) {
		throw new TuneloError(
			"TUNELO_KEY_001",
			`Max API keys (${maxKeys}) reached`,
			400,
		);
	}

	const rawKey = `${KEY_PREFIX}${generateKeyId()}`;
	const keyHash = hashKey(rawKey);
	const keyPrefix = `${rawKey.slice(0, 12)}...`;

	const apiKey = await ApiKey.create({
		userId,
		keyHash,
		keyPrefix,
		label: label ?? "Default",
	});

	return {
		id: String(apiKey._id),
		key: rawKey, // Show plaintext once
		keyPrefix,
	};
}

export async function revokeKey(userId: string, keyId: string): Promise<void> {
	const apiKey = await ApiKey.findOne({ _id: keyId, userId });
	if (!apiKey) {
		throw new TuneloError("TUNELO_KEY_002", "API key not found", 404);
	}

	apiKey.status = "revoked";
	await apiKey.save();

	// Disconnect active tunnels using this key
	tunnelManager.disconnectByKeyHash(apiKey.keyHash);
}
