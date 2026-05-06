import cors from "cors";
import { Router, json } from "express";

import { createAdminRouter } from "./admin-routes.js";
import { createAuthRouter } from "./auth-routes.js";
import { createDeviceAuthRouter } from "./device-auth-routes.js";
import { createKeyRouter } from "./key-routes.js";
import { csrfProtection } from "./middleware/csrf-protection.js";
import { errorHandler } from "./middleware/error-handler.js";
import { createProfileRouter } from "./profile-routes.js";
import { createUsageRouter } from "./usage-routes.js";

export function createApiRouter(): Router {
	const router = Router();

	// CORS: allow client portal + dashboard (dev + production)
	// Override via CORS_ORIGINS env (comma-separated) for additional origins
	const defaultOrigins = [
		"http://localhost:4040",
		"http://127.0.0.1:4040",
		"http://localhost:5173",
		"http://127.0.0.1:5173",
	];
	const extraOrigins = (process.env.CORS_ORIGINS ?? "")
		.split(",")
		.map((o) => o.trim())
		.filter(Boolean);
	router.use(
		cors({
			origin: [...defaultOrigins, ...extraOrigins],
			credentials: true,
		}),
	);

	router.use(json({ limit: "1mb" }));
	router.use(csrfProtection);

	router.use("/auth", createAuthRouter());
	router.use("/auth/device", createDeviceAuthRouter());
	router.use("/keys", createKeyRouter());
	router.use("/profile", createProfileRouter());
	router.use("/usage", createUsageRouter());
	router.use("/admin", createAdminRouter());

	router.use(errorHandler);

	return router;
}
