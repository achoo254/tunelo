import { type InferRawDocType, Schema, model } from "mongoose";

const apiKeySchema = new Schema(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: true,
			index: true,
		},
		keyHash: { type: String, required: true, unique: true, index: true },
		keyPrefix: { type: String, required: true },
		label: { type: String, default: "Default" },
		status: { type: String, enum: ["active", "revoked"], default: "active" },
		expiresAt: { type: Date, default: null },
		lastUsedAt: { type: Date, default: null },
	},
	{ timestamps: { createdAt: true, updatedAt: false } },
);

export type ApiKeyDocument = InferRawDocType<typeof apiKeySchema> & {
	_id: Schema.Types.ObjectId;
};

export const ApiKey = model("ApiKey", apiKeySchema);
