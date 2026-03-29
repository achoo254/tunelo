import { randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { parseCookies } from "./cookie-auth.js";

const CSRF_COOKIE = "tunelo_csrf";
const CSRF_HEADER = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Generate CSRF token and set as cookie */
export function csrfTokenEndpoint(_req: Request, res: Response): void {
	const token = randomBytes(32).toString("hex");
	const isProd = process.env.NODE_ENV === "production";
	res.cookie(isProd ? "__Host-tunelo_csrf" : CSRF_COOKIE, token, {
		httpOnly: false, // JS must read this cookie
		secure: isProd,
		sameSite: isProd ? "strict" : "lax",
		path: "/",
		maxAge: 24 * 60 * 60 * 1000, // 24h
	});
	res.json({ csrfToken: token });
}

// CLI endpoints that use Bearer API key auth instead of cookies — skip CSRF
const CSRF_EXEMPT_PATHS = new Set([
	"/auth/signup",
	"/auth/login-cli",
	"/auth/verify-totp",
	"/auth/device",
	"/auth/device/poll",
]);

/** Validate CSRF token on mutating requests (double-submit cookie pattern) */
export function csrfProtection(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	if (SAFE_METHODS.has(req.method)) {
		next();
		return;
	}

	// Skip CSRF for CLI endpoints and Bearer token auth
	if (
		CSRF_EXEMPT_PATHS.has(req.path) ||
		req.headers.authorization?.startsWith("Bearer ")
	) {
		next();
		return;
	}

	const isProd = process.env.NODE_ENV === "production";
	const cookieName = isProd ? "__Host-tunelo_csrf" : CSRF_COOKIE;
	const cookieToken = parseCookies(req.headers.cookie ?? "")[cookieName];
	const headerToken = req.headers[CSRF_HEADER] as string | undefined;

	if (!cookieToken || !headerToken || cookieToken !== headerToken) {
		res.status(403).json({
			error: { code: "TUNELO_AUTH_005", message: "Invalid CSRF token" },
		});
		return;
	}

	next();
}
