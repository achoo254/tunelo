import { type InferRawDocType, Schema, model } from "mongoose";

const userSchema = new Schema(
	{
		email: {
			type: String,
			required: true,
			unique: true,
			lowercase: true,
			trim: true,
		},
		passwordHash: { type: String, required: true },
		role: { type: String, enum: ["user", "admin"], default: "user" },
		totpSecret: { type: String, default: null },
		totpVerified: { type: Boolean, default: false },
		limits: {
			maxKeys: { type: Number, default: 5 },
			maxTunnelsPerKey: { type: Number, default: 3 },
			maxRequestsPerDay: { type: Number, default: 10000 },
		},
		status: { type: String, enum: ["active", "suspended"], default: "active" },
		plan: { type: String, default: "free" },
	},
	{ timestamps: true },
);

export type UserDocument = InferRawDocType<typeof userSchema> & {
	_id: Schema.Types.ObjectId;
};

export const User = model("User", userSchema);
