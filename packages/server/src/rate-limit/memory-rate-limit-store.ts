import type { RateLimitResult, RateLimitStore } from "./rate-limit-store.js";

interface Entry {
	count: number;
	resetAt: number;
}

export class MemoryRateLimitStore implements RateLimitStore {
	private entries = new Map<string, Entry>();
	private cleanupInterval: ReturnType<typeof setInterval>;

	constructor(private readonly windowMs: number) {
		this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
		this.cleanupInterval.unref();
	}

	async increment(key: string): Promise<RateLimitResult> {
		const now = Date.now();
		const existing = this.entries.get(key);

		if (!existing || existing.resetAt <= now) {
			const entry: Entry = { count: 1, resetAt: now + this.windowMs };
			this.entries.set(key, entry);
			return entry;
		}

		existing.count++;
		return { count: existing.count, resetAt: existing.resetAt };
	}

	async reset(key: string): Promise<void> {
		this.entries.delete(key);
	}

	destroy(): void {
		clearInterval(this.cleanupInterval);
		this.entries.clear();
	}

	private cleanup(): void {
		const now = Date.now();
		for (const [key, entry] of this.entries) {
			if (entry.resetAt <= now) this.entries.delete(key);
		}
	}
}
