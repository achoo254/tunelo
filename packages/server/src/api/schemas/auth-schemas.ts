import { z } from "zod";

export const signupSchema = z.object({
	email: z.string().email("Invalid email"),
	password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
	email: z.string().email("Invalid email"),
	password: z.string(),
	totpCode: z
		.string()
		.regex(/^\d{6}$/, "TOTP code must be 6 digits")
		.optional(),
});

export const loginCliSchema = z.object({
	email: z.string().email("Invalid email"),
	password: z.string(),
	totpCode: z
		.string()
		.regex(/^\d{6}$/, "TOTP code must be 6 digits")
		.optional(),
	keyLabel: z.string().max(100).optional(),
});

export const verifyTotpSchema = z.object({
	userId: z.string().min(1, "userId required"),
	totpCode: z.string().regex(/^\d{6}$/, "TOTP code must be 6 digits"),
});

export const changePasswordSchema = z.object({
	oldPassword: z.string(),
	newPassword: z.string().min(8, "Password must be at least 8 characters"),
});
