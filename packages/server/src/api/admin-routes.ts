import { Router } from "express";
import * as adminService from "../services/admin-service.js";
import { adminGuard } from "./middleware/admin-guard.js";
import { cookieAuth } from "./middleware/cookie-auth.js";
import { validateBody } from "./middleware/validate-body.js";
import {
	paginationSchema,
	updateUserStatusSchema,
} from "./schemas/admin-schemas.js";
import { createAdminUsageHandler } from "./usage-routes.js";

export function createAdminRouter(): Router {
	const router = Router();

	router.use(cookieAuth);
	router.use(adminGuard);

	router.get("/users", async (req, res, next) => {
		try {
			const { page, limit } = paginationSchema.parse({
				page: req.query.page,
				limit: req.query.limit,
			});
			const result = await adminService.listUsers(page, limit);
			res.json(result);
		} catch (err) {
			next(err);
		}
	});

	router.patch(
		"/users/:userId",
		validateBody(updateUserStatusSchema),
		async (req, res, next) => {
			try {
				const result = await adminService.updateUserStatus(
					String(req.params.userId),
					req.body.status,
				);
				res.json(result);
			} catch (err) {
				next(err);
			}
		},
	);

	router.get("/keys", async (req, res, next) => {
		try {
			const { page, limit } = paginationSchema.parse({
				page: req.query.page,
				limit: req.query.limit,
			});
			const result = await adminService.listAllKeys(page, limit);
			res.json(result);
		} catch (err) {
			next(err);
		}
	});

	router.delete("/keys/:keyId", async (req, res, next) => {
		try {
			const result = await adminService.revokeAnyKey(String(req.params.keyId));
			res.json(result);
		} catch (err) {
			next(err);
		}
	});

	router.get("/usage", createAdminUsageHandler());

	router.get("/tunnels", (_req, res) => {
		const tunnels = adminService.getActiveTunnels();
		res.json({ tunnels });
	});

	router.get("/stats", async (_req, res, next) => {
		try {
			const stats = await adminService.getSystemStats();
			res.json(stats);
		} catch (err) {
			next(err);
		}
	});

	return router;
}
