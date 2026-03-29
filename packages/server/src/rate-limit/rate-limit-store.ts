export interface RateLimitResult {
	count: number;
	resetAt: number;
}

export interface RateLimitStore {
	increment(key: string): Promise<RateLimitResult>;
	reset(key: string): Promise<void>;
}

export interface RateLimitConfig {
	windowMs: number;
	maxRequests: number;
	store: RateLimitStore;
}
