import type { NextFunction, Request, Response } from "express";

export function adminGuard(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	if (req.userRole !== "admin") {
		res.status(403).json({
			error: { code: "TUNELO_ADMIN_001", message: "Admin access required" },
		});
		return;
	}
	next();
}
