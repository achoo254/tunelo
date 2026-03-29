import { randomBytes } from "node:crypto";
import { TuneloError } from "../api/middleware/error-handler.js";
import { DeviceCode } from "../db/models/device-code-model.js";
import { User } from "../db/models/user-model.js";
import * as keyService from "./key-service.js";

const DEVICE_CODE_LENGTH = 32;
const USER_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I for clarity
const DEVICE_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_APPROVE_ATTEMPTS = 5;

/** Generate cryptographically random hex string */
function generateDeviceCode(): string {
	return randomBytes(DEVICE_CODE_LENGTH / 2).toString("hex");
}

/** Generate user-friendly XXXX-XXXX code */
function generateUserCode(): string {
	const bytes = randomBytes(8);
	let code = "";
	for (let i = 0; i < 8; i++) {
		code += USER_CODE_CHARS[bytes[i] % USER_CODE_CHARS.length];
	}
	return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export async function createDeviceCode(serverBaseUrl: string): Promise<{
	deviceCode: string;
	userCode: string;
	verificationUrl: string;
	expiresIn: number;
}> {
	const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_MS);

	// Retry on unique index collision (unlikely but possible)
	let deviceCode = "";
	let userCode = "";
	for (let attempt = 0; attempt < 3; attempt++) {
		deviceCode = generateDeviceCode();
		userCode = generateUserCode();
		try {
			await DeviceCode.create({
				deviceCode,
				userCode,
				status: "pending",
				approveAttempts: 0,
				expiresAt,
			});
			break;
		} catch (err: unknown) {
			const mongoErr = err as { code?: number };
			if (mongoErr.code !== 11000 || attempt === 2) throw err;
		}
	}

	const verificationUrl = `${serverBaseUrl}/portal/auth/device?code=${userCode}`;

	return {
		deviceCode,
		userCode,
		verificationUrl,
		expiresIn: Math.floor(DEVICE_CODE_TTL_MS / 1000),
	};
}

export async function pollDeviceCode(deviceCode: string): Promise<
	| { status: "pending" }
	| {
			status: "approved";
			key: string;
			keyPrefix: string;
			userId: string;
			email: string;
	  }
	| { status: "expired" }
> {
	// Atomic find+delete for approved codes — prevents duplicate key retrieval
	const approved = await DeviceCode.findOneAndDelete({
		deviceCode,
		status: "approved",
		expiresAt: { $gt: new Date() },
	});

	if (approved?.apiKey && approved.keyPrefix && approved.email) {
		return {
			status: "approved" as const,
			key: approved.apiKey,
			keyPrefix: approved.keyPrefix,
			userId: String(approved.userId),
			email: approved.email,
		};
	}

	// Check if pending or expired
	const doc = await DeviceCode.findOne({ deviceCode });
	if (!doc || doc.expiresAt < new Date()) {
		return { status: "expired" };
	}

	return { status: "pending" };
}

export async function approveDeviceCode(
	userCode: string,
	userId: string,
): Promise<void> {
	// Atomic increment + validation — prevents race condition on concurrent approvals
	const doc = await DeviceCode.findOneAndUpdate(
		{
			userCode,
			status: "pending",
			expiresAt: { $gt: new Date() },
			approveAttempts: { $lt: MAX_APPROVE_ATTEMPTS },
		},
		{ $inc: { approveAttempts: 1 } },
		{ new: true },
	);

	if (!doc) {
		// Determine specific error
		const existing = await DeviceCode.findOne({ userCode });
		if (!existing) {
			throw new TuneloError(
				"TUNELO_DEVICE_001",
				"Invalid or expired device code",
				404,
			);
		}
		if (existing.expiresAt < new Date()) {
			throw new TuneloError(
				"TUNELO_DEVICE_002",
				"Device code has expired",
				410,
			);
		}
		if (existing.status === "approved") {
			throw new TuneloError(
				"TUNELO_DEVICE_003",
				"Device code already approved",
				409,
			);
		}
		throw new TuneloError(
			"TUNELO_DEVICE_004",
			"Too many approve attempts",
			429,
		);
	}

	const user = await User.findById(userId).lean();
	if (!user) {
		throw new TuneloError("TUNELO_AUTH_001", "User not found", 404);
	}

	const label = `device-auth-${new Date().toISOString().slice(0, 10)}`;
	const keyResult = await keyService.createKey(userId, label);

	await DeviceCode.updateOne(
		{ _id: doc._id },
		{
			status: "approved",
			userId: user._id,
			apiKey: keyResult.key,
			keyPrefix: keyResult.keyPrefix,
			email: user.email,
		},
	);
}
