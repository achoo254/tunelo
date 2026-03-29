import type { NextFunction, Request, Response } from "express";
import { createLogger } from "../../logger.js";

const logger = createLogger("tunelo-error-handler");

export class TuneloError extends Error {
	constructor(
		public readonly code: string,
		message: string,
		public readonly statusCode: number = 400,
	) {
		super(message);
		this.name = "TuneloError";
	}
}

export function errorHandler(
	err: Error,
	_req: Request,
	res: Response,
	_next: NextFunction,
): void {
	if (err instanceof TuneloError) {
		res.status(err.statusCode).json({
			error: { code: err.code, message: err.message },
		});
		return;
	}

	logger.error({ err }, "Unhandled error");
	res.status(500).json({
		error: { code: "TUNELO_SERVER_001", message: "Internal server error" },
	});
}
