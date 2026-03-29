import { createLogger } from "../logger.js";
import type { KeyStore } from "./key-store-types.js";
import { MongoKeyStore } from "./mongo-key-store.js";

const logger = createLogger("tunelo-key-store-factory");

export function createKeyStore(): KeyStore {
	const mongoUri = process.env.MONGO_URI;
	if (!mongoUri) {
		throw new Error(
			"MONGO_URI env var required — Tunelo requires MongoDB for key management",
		);
	}

	logger.info("Using MongoKeyStore");
	return new MongoKeyStore(mongoUri);
}
