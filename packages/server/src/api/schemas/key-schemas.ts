import { z } from "zod";

export const createKeySchema = z.object({
	label: z.string().max(100).optional(),
});
