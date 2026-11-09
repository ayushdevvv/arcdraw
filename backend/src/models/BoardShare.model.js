import mongoose from "mongoose";

const boardShareSchema = new mongoose.Schema({
  board: { type: mongoose.Schema.Types.ObjectId, ref: "Board", required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  permission: { type: String, enum: ["viewer", "editor"], default: "viewer" },
  expiresAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  lastUsedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });

boardShareSchema.index({ board:  1, revokedAt: 1, createdAt: -1 });
export default mongoose.model("BoardShare", boardShareSchema);
