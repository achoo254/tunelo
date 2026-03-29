import type { NextFunction, Request, Response } from "express";
import type { RateLimitConfig } from "../../rate-limit/rate-limit-store.js";

export function createRateLimiter(config: RateLimitConfig) {
	return async (
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> => {
		const key = req.ip ?? "unknown";
		const result = await config.store.increment(key);

		res.setHeader("X-RateLimit-Limit", config.maxRequests);
		res.setHeader(
			"X-RateLimit-Remaining",
			Math.max(0, config.maxRequests - result.count),
		);
		res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000));

		if (result.count > config.maxRequests) {
			res.status(429).json({
				error: { code: "TUNELO_RATE_001", message: "Too many requests" },
			});
			return;
		}

		next();
	};
}
