import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthPayload {
	userId: string;
	role: "user" | "admin";
}

declare global {
	namespace Express {
		interface Request {
			userId?: string;
			userRole?: "user" | "admin";
		}
	}
}

function getJwtSecret(): string {
	const secret = process.env.JWT_SECRET;
	if (!secret) throw new Error("JWT_SECRET env var required");
	return secret;
}

export function cookieAuth(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	const isProd = process.env.NODE_ENV === "production";
	const cookieName = isProd ? "__Host-tunelo_access" : "tunelo_access";
	const token = parseCookies(req.headers.cookie ?? "")[cookieName];

	if (!token) {
		res.status(401).json({
			error: { code: "TUNELO_AUTH_002", message: "Authentication required" },
		});
		return;
	}

	try {
		const payload = jwt.verify(token, getJwtSecret()) as AuthPayload;
		req.userId = payload.userId;
		req.userRole = payload.role;
		next();
	} catch {
		res.status(401).json({
			error: { code: "TUNELO_AUTH_002", message: "Invalid or expired token" },
		});
	}
}

/** Simple cookie parser — avoids cookie-parser dependency */
function parseCookies(cookieHeader: string): Record<string, string> {
	const cookies: Record<string, string> = {};
	for (const pair of cookieHeader.split(";")) {
		const [name, ...rest] = pair.trim().split("=");
		if (name) cookies[name] = decodeURIComponent(rest.join("="));
	}
	return cookies;
}

export { parseCookies };
