import { Schema, model } from "mongoose";

const usageLogSchema = new Schema({
	keyId: { type: Schema.Types.ObjectId, required: true },
	userId: { type: Schema.Types.ObjectId, required: true },
	date: { type: String, required: true }, // "YYYY-MM-DD"
	requestCount: { type: Number, default: 0 },
	bytesIn: { type: Number, default: 0 },
	bytesOut: { type: Number, default: 0 },
});

usageLogSchema.index({ userId: 1, date: 1 });
usageLogSchema.index({ keyId: 1, date: 1 });
usageLogSchema.index({ date: 1 });

export const UsageLog = model("UsageLog", usageLogSchema);
