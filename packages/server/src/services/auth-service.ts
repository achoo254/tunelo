import bcrypt from "bcrypt";
import type { Response } from "express";
import jwt from "jsonwebtoken";
import { TuneloError } from "../api/middleware/error-handler.js";
import { User } from "../db/models/user-model.js";
import * as keyService from "./key-service.js";
import {
	generateQrDataUrl,
	generateTotpSecret,
	verifyTotpCode,
} from "./totp-service.js";

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = "24h";
const REFRESH_TOKEN_EXPIRY = "7d";

function getJwtSecret(): string {
	const secret = process.env.JWT_SECRET;
	if (!secret) throw new Error("JWT_SECRET env var required");
	return secret;
}

function getAdminEmails(): Set<string> {
	const emails = process.env.ADMIN_EMAILS ?? "";
	return new Set(
		emails
			.split(",")
			.map((e) => e.trim().toLowerCase())
			.filter(Boolean),
	);
}

function setCookies(res: Response, userId: string, role: string): void {
	const secret = getJwtSecret();
	const isProd = process.env.NODE_ENV === "production";

	const accessToken = jwt.sign({ userId, role }, secret, {
		expiresIn: ACCESS_TOKEN_EXPIRY,
	});
	const refreshToken = jwt.sign({ userId, role, type: "refresh" }, secret, {
		expiresIn: REFRESH_TOKEN_EXPIRY,
	});

	const cookieBase = {
		httpOnly: true,
		secure: isProd,
		sameSite: (isProd ? "strict" : "lax") as "strict" | "lax",
		path: "/",
	};

	const accessName = isProd ? "__Host-tunelo_access" : "tunelo_access";
	const refreshName = isProd ? "__Host-tunelo_refresh" : "tunelo_refresh";

	res.cookie(accessName, accessToken, {
		...cookieBase,
		maxAge: 24 * 60 * 60 * 1000,
	});
	res.cookie(refreshName, refreshToken, {
		...cookieBase,
		maxAge: 7 * 24 * 60 * 60 * 1000,
	});
}

export async function signup(
	email: string,
	password: string,
): Promise<{
	userId: string;
	requireTotp: boolean;
	qrDataUrl?: string;
	totpSecret?: string;
}> {
	const existing = await User.findOne({ email: email.toLowerCase() }).lean();
	if (existing) {
		throw new TuneloError("TUNELO_USER_001", "Email already registered", 409);
	}

	const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
	const adminEmails = getAdminEmails();
	const isAdmin = adminEmails.has(email.toLowerCase());
	const role = isAdmin ? "admin" : "user";

	if (isAdmin) {
		// Admin must setup TOTP
		const { secret, otpauthUrl } = generateTotpSecret(email);
		const qrDataUrl = await generateQrDataUrl(otpauthUrl);
		const user = await User.create({
			email: email.toLowerCase(),
			passwordHash,
			role,
			totpSecret: secret,
			totpVerified: false,
		});
		return {
			userId: String(user._id),
			requireTotp: true,
			qrDataUrl,
			totpSecret: secret,
		};
	}

	// Non-admin: skip TOTP, account ready immediately
	const user = await User.create({
		email: email.toLowerCase(),
		passwordHash,
		role,
		totpSecret: null,
		totpVerified: true,
	});
	return { userId: String(user._id), requireTotp: false };
}

export async function verifyTotp(
	userId: string,
	totpCode: string,
	res: Response,
): Promise<void> {
	const user = await User.findById(userId);
	if (!user || !user.totpSecret) {
		throw new TuneloError("TUNELO_AUTH_001", "User not found", 404);
	}

	if (!verifyTotpCode(user.totpSecret, totpCode)) {
		throw new TuneloError("TUNELO_AUTH_004", "Invalid TOTP code", 401);
	}

	user.totpVerified = true;
	await user.save();
	setCookies(res, String(user._id), user.role ?? "user");
}

export async function login(
	email: string,
	password: string,
	totpCode: string | undefined,
	res: Response,
): Promise<{ userId: string; role: string }> {
	const user = await User.findOne({ email: email.toLowerCase() });
	if (!user) {
		throw new TuneloError("TUNELO_AUTH_002", "Invalid credentials", 401);
	}

	const valid = await bcrypt.compare(password, user.passwordHash);
	if (!valid) {
		throw new TuneloError("TUNELO_AUTH_002", "Invalid credentials", 401);
	}

	if (user.status === "suspended") {
		throw new TuneloError("TUNELO_AUTH_006", "Account suspended", 403);
	}

	// TOTP required only if user has it enabled
	if (user.totpSecret && user.totpVerified) {
		if (!totpCode) {
			throw new TuneloError("TUNELO_AUTH_005", "TOTP code required", 401);
		}
		if (!verifyTotpCode(user.totpSecret, totpCode)) {
			throw new TuneloError("TUNELO_AUTH_004", "Invalid TOTP code", 401);
		}
	} else if (user.role === "admin" && !user.totpVerified) {
		throw new TuneloError("TUNELO_AUTH_003", "TOTP setup not completed", 403);
	}

	setCookies(res, String(user._id), user.role ?? "user");
	return { userId: String(user._id), role: user.role ?? "user" };
}

/** CLI login: validates credentials, creates API key, returns plaintext key */
export async function loginCli(
	email: string,
	password: string,
	totpCode?: string,
	keyLabel?: string,
): Promise<{ userId: string; role: string; key: string; keyPrefix: string }> {
	const user = await User.findOne({ email: email.toLowerCase() });
	if (!user) {
		throw new TuneloError("TUNELO_AUTH_002", "Invalid credentials", 401);
	}

	const valid = await bcrypt.compare(password, user.passwordHash);
	if (!valid) {
		throw new TuneloError("TUNELO_AUTH_002", "Invalid credentials", 401);
	}

	if (user.status === "suspended") {
		throw new TuneloError("TUNELO_AUTH_006", "Account suspended", 403);
	}

	// TOTP check — same logic as login
	if (user.totpSecret && user.totpVerified) {
		if (!totpCode) {
			throw new TuneloError("TUNELO_AUTH_005", "TOTP code required", 401);
		}
		if (!verifyTotpCode(user.totpSecret, totpCode)) {
			throw new TuneloError("TUNELO_AUTH_004", "Invalid TOTP code", 401);
		}
	} else if (user.role === "admin" && !user.totpVerified) {
		throw new TuneloError("TUNELO_AUTH_003", "TOTP setup not completed", 403);
	}

	const label = keyLabel ?? `cli-${Date.now()}`;
	const result = await keyService.createKey(String(user._id), label);

	return {
		userId: String(user._id),
		role: user.role ?? "user",
		key: result.key,
		keyPrefix: result.keyPrefix,
	};
}

export async function refresh(
	refreshTokenValue: string,
	res: Response,
): Promise<void> {
	const secret = getJwtSecret();
	try {
		const payload = jwt.verify(refreshTokenValue, secret) as {
			userId: string;
			role: string;
			type?: string;
		};
		if (payload.type !== "refresh") {
			throw new TuneloError("TUNELO_AUTH_002", "Invalid refresh token", 401);
		}

		// Verify user still active
		const user = await User.findById(payload.userId).lean();
		if (!user || user.status === "suspended") {
			throw new TuneloError(
				"TUNELO_AUTH_002",
				"User not found or suspended",
				401,
			);
		}

		setCookies(res, payload.userId, payload.role);
	} catch (err) {
		if (err instanceof TuneloError) throw err;
		throw new TuneloError("TUNELO_AUTH_002", "Invalid refresh token", 401);
	}
}

export function logout(res: Response): void {
	const isProd = process.env.NODE_ENV === "production";
	const opts = { httpOnly: true, path: "/" };
	res.clearCookie(isProd ? "__Host-tunelo_access" : "tunelo_access", opts);
	res.clearCookie(isProd ? "__Host-tunelo_refresh" : "tunelo_refresh", opts);
}

export async function changePassword(
	userId: string,
	oldPassword: string,
	newPassword: string,
): Promise<void> {
	const user = await User.findById(userId);
	if (!user) {
		throw new TuneloError("TUNELO_AUTH_001", "User not found", 404);
	}

	const valid = await bcrypt.compare(oldPassword, user.passwordHash);
	if (!valid) {
		throw new TuneloError("TUNELO_AUTH_002", "Invalid current password", 401);
	}

	user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
	await user.save();
}
