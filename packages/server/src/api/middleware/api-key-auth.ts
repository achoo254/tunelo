import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { ApiKey } from "../../db/models/api-key-model.js";
import { User } from "../../db/models/user-model.js";

/**
 * Middleware: authenticate via Bearer API key in Authorization header.
 * Extracts userId and role from the key's associated user.
 * Falls through to next middleware if no Bearer token present (allows chaining with cookieAuth).
 */
export function apiKeyAuth(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	const authHeader = req.headers.authorization;
	if (!authHeader?.startsWith("Bearer ")) {
		next();
		return;
	}

	const rawKey = authHeader.slice(7);
	const keyHash = createHash("sha256").update(rawKey).digest("hex");

	ApiKey.findOne({ keyHash, status: "active" })
		.lean()
		.then(async (apiKey) => {
			if (!apiKey) {
				res.status(401).json({
					error: {
						code: "TUNELO_AUTH_001",
						message: "Invalid API key",
					},
				});
				return;
			}

			const user = await User.findById(apiKey.userId).lean();
			if (!user || user.status === "suspended") {
				res.status(401).json({
					error: {
						code: "TUNELO_AUTH_002",
						message: "User not found or suspended",
					},
				});
				return;
			}

			req.userId = String(apiKey.userId);
			req.userRole = (user.role as "user" | "admin") ?? "user";
			next();
		})
		.catch(next);
}

/**
 * Combined auth: tries API key first, falls back to cookie auth.
 * Rejects if neither method provides authentication.
 */
export function combinedAuth(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	apiKeyAuth(req, res, () => {
		if (req.userId) {
			next();
			return;
		}
		// Import cookieAuth dynamically to avoid circular deps
		import("./cookie-auth.js").then(({ cookieAuth }) => {
			cookieAuth(req, res, next);
		});
	});
}
