import mongoose from "mongoose";
import { createLogger } from "../logger.js";

const logger = createLogger("tunelo-db");

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export async function connectDb(uri: string): Promise<void> {
	let attempt = 0;
	while (attempt < MAX_RETRIES) {
		try {
			await mongoose.connect(uri, {
				serverSelectionTimeoutMS: 5000,
				heartbeatFrequencyMS: 10000,
			});
			logger.info("MongoDB connected");
			mongoose.connection.on("error", (err) => {
				logger.error({ err }, "MongoDB connection error");
			});
			mongoose.connection.on("disconnected", () => {
				logger.warn("MongoDB disconnected");
			});
			return;
		} catch (err) {
			attempt++;
			logger.warn(
				{ err, attempt, maxRetries: MAX_RETRIES },
				"MongoDB connection failed, retrying",
			);
			if (attempt >= MAX_RETRIES) {
				throw new Error(
					`MongoDB connection failed after ${MAX_RETRIES} attempts`,
				);
			}
			await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
		}
	}
}

export async function disconnectDb(): Promise<void> {
	await mongoose.disconnect();
	logger.info("MongoDB disconnected gracefully");
}

export function isDbHealthy(): boolean {
	return mongoose.connection.readyState === 1;
}
