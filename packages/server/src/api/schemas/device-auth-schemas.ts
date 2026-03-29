import { z } from "zod";

export const pollDeviceSchema = z.object({
	deviceCode: z.string().length(32, "deviceCode must be 32 characters"),
});

export const approveDeviceSchema = z.object({
	userCode: z
		.string()
		.regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/, "userCode must be XXXX-XXXX format"),
});
