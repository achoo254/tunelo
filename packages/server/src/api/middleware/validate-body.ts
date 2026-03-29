import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

export function validateBody(schema: ZodType) {
	return (req: Request, res: Response, next: NextFunction): void => {
		const result = schema.safeParse(req.body);
		if (!result.success) {
			const errors = result.error.issues.map((i) => ({
				path: i.path.join("."),
				message: i.message,
			}));
			res.status(400).json({
				error: {
					code: "TUNELO_VALIDATION_001",
					message: "Validation failed",
					details: errors,
				},
			});
			return;
		}
		req.body = result.data;
		next();
	};
}
