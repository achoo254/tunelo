import { UsageLog } from "../db/models/usage-log-model.js";
import { createLogger } from "../logger.js";

const logger = createLogger("tunelo-usage-tracker");

const MAX_BUFFER_SIZE = 10_000;
const FLUSH_INTERVAL_MS = 60_000;

interface BufferEntry {
	keyId: string;
	userId: string;
	requestCount: number;
	bytesIn: number;
	bytesOut: number;
}

class UsageTracker {
	private buffer = new Map<string, BufferEntry>();
	private flushInterval: ReturnType<typeof setInterval> | null = null;

	/** Record usage — synchronous push to buffer, no await */
	record(
		keyId: string,
		userId: string,
		bytesIn: number,
		bytesOut: number,
	): void {
		const date = new Date().toISOString().slice(0, 10);
		const compositeKey = `${keyId}:${date}`;

		const existing = this.buffer.get(compositeKey);
		if (existing) {
			existing.requestCount++;
			existing.bytesIn += bytesIn;
			existing.bytesOut += bytesOut;
		} else {
			if (this.buffer.size >= MAX_BUFFER_SIZE) {
				logger.warn("Usage buffer overflow, dropping oldest entries");
				const firstKey = this.buffer.keys().next().value;
				if (firstKey) this.buffer.delete(firstKey);
			}
			this.buffer.set(compositeKey, {
				keyId,
				userId,
				requestCount: 1,
				bytesIn,
				bytesOut,
			});
		}
	}

	async flush(): Promise<void> {
		if (this.buffer.size === 0) return;

		const entries = [...this.buffer.entries()];
		this.buffer.clear();

		const ops = entries.map(([compositeKey, entry]) => {
			const date = compositeKey.split(":").pop()!;
			return {
				updateOne: {
					filter: { keyId: entry.keyId, userId: entry.userId, date },
					update: {
						$inc: {
							requestCount: entry.requestCount,
							bytesIn: entry.bytesIn,
							bytesOut: entry.bytesOut,
						},
					},
					upsert: true,
				},
			};
		});

		try {
			await UsageLog.bulkWrite(ops);
			logger.info({ flushed: ops.length }, "Usage buffer flushed");
		} catch (err) {
			logger.error({ err }, "Usage flush failed, entries lost");
		}
	}

	start(): void {
		this.flushInterval = setInterval(() => {
			this.flush().catch((err) => {
				logger.error({ err }, "Usage flush interval error");
			});
		}, FLUSH_INTERVAL_MS);
		this.flushInterval.unref();
		logger.info("UsageTracker started");
	}

	async stop(): Promise<void> {
		if (this.flushInterval) {
			clearInterval(this.flushInterval);
			this.flushInterval = null;
		}
		await this.flush();
		logger.info("UsageTracker stopped");
	}
}

export const usageTracker = new UsageTracker();
