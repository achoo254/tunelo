import mongoose, { type Document, Schema } from "mongoose";

export interface IDeviceCode extends Document {
	deviceCode: string;
	userCode: string;
	status: "pending" | "approved" | "expired";
	userId?: mongoose.Types.ObjectId;
	apiKey?: string;
	keyPrefix?: string;
	email?: string;
	approveAttempts: number;
	expiresAt: Date;
	createdAt: Date;
}

const deviceCodeSchema = new Schema<IDeviceCode>(
	{
		deviceCode: { type: String, required: true },
		userCode: { type: String, required: true },
		status: {
			type: String,
			enum: ["pending", "approved", "expired"],
			default: "pending",
		},
		userId: { type: Schema.Types.ObjectId, ref: "User" },
		apiKey: { type: String },
		keyPrefix: { type: String },
		email: { type: String },
		approveAttempts: { type: Number, default: 0 },
		expiresAt: { type: Date, required: true },
	},
	{ timestamps: true },
);

deviceCodeSchema.index({ deviceCode: 1 }, { unique: true });
deviceCodeSchema.index({ userCode: 1 }, { unique: true });
deviceCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const DeviceCode = mongoose.model<IDeviceCode>(
	"DeviceCode",
	deviceCodeSchema,
);
