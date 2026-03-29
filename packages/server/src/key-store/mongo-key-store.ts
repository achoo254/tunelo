import { connectDb, disconnectDb } from "../db/connection-manager.js";
import { ApiKey } from "../db/models/api-key-model.js";
import { User } from "../db/models/user-model.js";
import { createLogger } from "../logger.js";
import type { KeyInfo, KeyStore } from "./key-store-types.js";

const logger = createLogger("tunelo-mongo-key-store");

export class MongoKeyStore implements KeyStore {
	constructor(private readonly uri: string) {}

	async validate(keyHash: string): Promise<KeyInfo | null> {
		const apiKey = await ApiKey.findOne({
			keyHash,
			status: "active",
		}).lean();

		if (!apiKey) return null;

		// Check expiry
		if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
			return null;
		}

		const user = await User.findOne({
			_id: apiKey.userId,
			status: "active",
		}).lean();

		if (!user) return null;

		// Fire-and-forget lastUsedAt update
		ApiKey.updateOne(
			{ _id: apiKey._id },
			{ $set: { lastUsedAt: new Date() } },
		).catch((err) => {
			logger.warn({ err }, "Failed to update lastUsedAt");
		});

		return {
			userId: String(apiKey.userId),
			keyId: String(apiKey._id),
			keyHash,
			maxTunnels: user.limits?.maxTunnelsPerKey ?? 3,
			plan: user.plan ?? "free",
			role: (user.role as "user" | "admin") ?? "user",
		};
	}

	async recordUsage(_keyHash: string): Promise<void> {
		// Placeholder — implemented in Phase 3 (UsageTracker)
	}

	async initialize(): Promise<void> {
		await connectDb(this.uri);
		logger.info("MongoKeyStore initialized");
	}

	async shutdown(): Promise<void> {
		await disconnectDb();
		logger.info("MongoKeyStore shut down");
	}
}
