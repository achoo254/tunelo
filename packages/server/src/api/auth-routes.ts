import { Router } from "express";
import { MemoryRateLimitStore } from "../rate-limit/memory-rate-limit-store.js";
import * as authService from "../services/auth-service.js";
import { cookieAuth, parseCookies } from "./middleware/cookie-auth.js";
import { csrfTokenEndpoint } from "./middleware/csrf-protection.js";
import { createRateLimiter } from "./middleware/rate-limiter.js";
import { validateBody } from "./middleware/validate-body.js";
import {
	loginCliSchema,
	loginSchema,
	signupSchema,
	verifyTotpSchema,
} from "./schemas/auth-schemas.js";

export function createAuthRouter(): Router {
	const router = Router();

	const signupLimiter = createRateLimiter({
		windowMs: 60 * 60 * 1000, // 1 hour
		maxRequests: 5,
		store: new MemoryRateLimitStore(60 * 60 * 1000),
	});

	const loginLimiter = createRateLimiter({
		windowMs: 15 * 60 * 1000, // 15 min
		maxRequests: 10,
		store: new MemoryRateLimitStore(15 * 60 * 1000),
	});

	router.get("/csrf-token", csrfTokenEndpoint);

	router.post(
		"/signup",
		signupLimiter,
		validateBody(signupSchema),
		async (req, res, next) => {
			try {
				const result = await authService.signup(
					req.body.email,
					req.body.password,
				);
				res.status(201).json(result);
			} catch (err) {
				next(err);
			}
		},
	);

	router.post(
		"/verify-totp",
		signupLimiter,
		validateBody(verifyTotpSchema),
		async (req, res, next) => {
			try {
				await authService.verifyTotp(req.body.userId, req.body.totpCode, res);
				res.json({ success: true });
			} catch (err) {
				next(err);
			}
		},
	);

	router.post(
		"/login",
		loginLimiter,
		validateBody(loginSchema),
		async (req, res, next) => {
			try {
				const result = await authService.login(
					req.body.email,
					req.body.password,
					req.body.totpCode,
					res,
				);
				res.json({ userId: result.userId, role: result.role });
			} catch (err) {
				next(err);
			}
		},
	);

	// CLI login: returns API key instead of setting cookies
	router.post(
		"/login-cli",
		loginLimiter,
		validateBody(loginCliSchema),
		async (req, res, next) => {
			try {
				const result = await authService.loginCli(
					req.body.email,
					req.body.password,
					req.body.totpCode,
					req.body.keyLabel,
				);
				res.json(result);
			} catch (err) {
				next(err);
			}
		},
	);

	router.post("/refresh", async (req, res, next) => {
		try {
			const isProd = process.env.NODE_ENV === "production";
			const cookieName = isProd ? "__Host-tunelo_refresh" : "tunelo_refresh";
			const refreshToken = parseCookies(req.headers.cookie ?? "")[cookieName];
			if (!refreshToken) {
				res.status(401).json({
					error: { code: "TUNELO_AUTH_002", message: "No refresh token" },
				});
				return;
			}
			await authService.refresh(refreshToken, res);
			res.json({ success: true });
		} catch (err) {
			next(err);
		}
	});

	router.post("/logout", (_req, res) => {
		authService.logout(res);
		res.json({ success: true });
	});

	return router;
}
