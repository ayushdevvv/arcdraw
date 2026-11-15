import mongoose from "mongoose";

const boardJoinRequestSchema = new mongoose.Schema({
  board: { type: mongoose.Schema.Types.ObjectId, ref: "Board", required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true, versionKey: false });

boardJoinRequestSchema.index({ board: 1, user: 1 }, { unique: true });
boardJoinRequestSchema.index({ board: 1, status: 1, createdAt: -1 });

export default mongoose.model("BoardJoinRequest", boardJoinRequestSchema);
