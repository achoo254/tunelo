import {
	type NextFunction,
	type Request,
	type Response,
	Router,
} from "express";
import { UsageLog } from "../db/models/usage-log-model.js";
import { adminGuard } from "./middleware/admin-guard.js";
import { cookieAuth } from "./middleware/cookie-auth.js";
import { usageQuerySchema } from "./schemas/usage-schemas.js";

export function createUsageRouter(): Router {
	const router = Router();

	router.use(cookieAuth);

	// User's own usage
	router.get("/", async (req, res, next) => {
		try {
			const { startDate, endDate, keyId } = usageQuerySchema.parse({
				startDate: req.query.startDate,
				endDate: req.query.endDate,
				keyId: req.query.keyId,
			});

			const now = new Date();
			const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
				.toISOString()
				.slice(0, 10);
			const defaultEnd = now.toISOString().slice(0, 10);

			const filter: Record<string, unknown> = {
				userId: req.userId,
				date: {
					$gte: startDate ?? defaultStart,
					$lte: endDate ?? defaultEnd,
				},
			};
			if (keyId) filter.keyId = keyId;

			const usage = await UsageLog.find(filter).sort({ date: 1 }).lean();

			res.json({
				usage: usage.map((u) => ({
					date: u.date,
					requestCount: u.requestCount,
					bytesIn: u.bytesIn,
					bytesOut: u.bytesOut,
				})),
			});
		} catch (err) {
			next(err);
		}
	});

	return router;
}

/** Admin usage route — system-wide aggregated */
export function createAdminUsageHandler() {
	return async (
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> => {
		try {
			const { startDate: qStart, endDate: qEnd } = usageQuerySchema.parse({
				startDate: req.query.startDate,
				endDate: req.query.endDate,
			});
			const now = new Date();
			const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
				.toISOString()
				.slice(0, 10);
			const defaultEnd = now.toISOString().slice(0, 10);

			const startDate = qStart ?? defaultStart;
			const endDate = qEnd ?? defaultEnd;

			const usage = await UsageLog.aggregate([
				{ $match: { date: { $gte: startDate, $lte: endDate } } },
				{
					$group: {
						_id: "$date",
						requestCount: { $sum: "$requestCount" },
						bytesIn: { $sum: "$bytesIn" },
						bytesOut: { $sum: "$bytesOut" },
					},
				},
				{ $sort: { _id: 1 } },
			]);

			res.json({
				usage: usage.map((u) => ({
					date: u._id,
					requestCount: u.requestCount,
					bytesIn: u.bytesIn,
					bytesOut: u.bytesOut,
				})),
			});
		} catch (err) {
			next(err);
		}
	};
}
