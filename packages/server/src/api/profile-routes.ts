import { Router } from "express";
import { User } from "../db/models/user-model.js";
import * as authService from "../services/auth-service.js";
import { cookieAuth } from "./middleware/cookie-auth.js";
import { validateBody } from "./middleware/validate-body.js";
import { changePasswordSchema } from "./schemas/auth-schemas.js";

export function createProfileRouter(): Router {
	const router = Router();

	router.use(cookieAuth);

	router.get("/", async (req, res, next) => {
		try {
			const user = await User.findById(req.userId)
				.select("-passwordHash -totpSecret")
				.lean();
			if (!user) {
				res.status(404).json({
					error: { code: "TUNELO_AUTH_001", message: "User not found" },
				});
				return;
			}
			res.json({
				id: String(user._id),
				email: user.email,
				role: user.role,
				status: user.status,
				plan: user.plan,
				limits: user.limits,
				createdAt: user.createdAt,
			});
		} catch (err) {
			next(err);
		}
	});

	router.patch(
		"/password",
		validateBody(changePasswordSchema),
		async (req, res, next) => {
			try {
				await authService.changePassword(
					req.userId!,
					req.body.oldPassword,
					req.body.newPassword,
				);
				res.json({ success: true });
			} catch (err) {
				next(err);
			}
		},
	);

	return router;
}
