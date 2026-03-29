import { Router } from "express";
import { MemoryRateLimitStore } from "../rate-limit/memory-rate-limit-store.js";
import * as deviceAuthService from "../services/device-auth-service.js";
import { cookieAuth } from "./middleware/cookie-auth.js";
import { createRateLimiter } from "./middleware/rate-limiter.js";
import { validateBody } from "./middleware/validate-body.js";
import {
	approveDeviceSchema,
	pollDeviceSchema,
} from "./schemas/device-auth-schemas.js";

export function createDeviceAuthRouter(): Router {
	const router = Router();

	// Rate limit: 5 device code creations per hour per IP
	const createLimiter = createRateLimiter({
		windowMs: 60 * 60 * 1000,
		maxRequests: 5,
		store: new MemoryRateLimitStore(60 * 60 * 1000),
	});

	// Rate limit: 1 poll per 2 seconds per IP
	const pollLimiter = createRateLimiter({
		windowMs: 2_000,
		maxRequests: 1,
		store: new MemoryRateLimitStore(2_000),
	});

	// POST /api/auth/device — create device code
	router.post("/", createLimiter, async (req, res, next) => {
		try {
			const protocol = req.headers["x-forwarded-proto"] ?? req.protocol;
			const host = req.headers["x-forwarded-host"] ?? req.headers.host;
			const serverBaseUrl = `${protocol}://${host}`;

			const result = await deviceAuthService.createDeviceCode(serverBaseUrl);
			res.status(201).json(result);
		} catch (err) {
			next(err);
		}
	});

	// POST /api/auth/device/poll — CLI polls for approval
	router.post(
		"/poll",
		pollLimiter,
		validateBody(pollDeviceSchema),
		async (req, res, next) => {
			try {
				const result = await deviceAuthService.pollDeviceCode(
					req.body.deviceCode,
				);
				res.json(result);
			} catch (err) {
				next(err);
			}
		},
	);

	// POST /api/auth/device/approve — Portal approves (cookie auth required)
	router.post(
		"/approve",
		cookieAuth,
		validateBody(approveDeviceSchema),
		async (req, res, next) => {
			try {
				const userId = req.userId ?? "";
				await deviceAuthService.approveDeviceCode(req.body.userCode, userId);
				res.json({ success: true });
			} catch (err) {
				next(err);
			}
		},
	);

	return router;
}
