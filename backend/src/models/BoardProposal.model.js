import mongoose from "mongoose";

/**
 * A commit request. In commit mode an editor works on a private draft and
 * submits the difference between that draft and the shared room as a Yjs
 * update. The owner reviews it and either merges it into the room or declines.
 */
const boardProposalSchema = new mongoose.Schema({
  board: { type: mongoose.Schema.Types.ObjectId, ref: "Board", required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  message: { type: String, required: true, trim: true, maxlength: 140 },
  update: { type: Buffer, required: true, select: false },
  byteLength: { type: Number, default: 0 },
  summary: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: {
    type: String,
    enum: ["pending", "accepted", "rejected", "withdrawn"],
    default: "pending",
    index: true
  },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  resolvedAt: { type: Date, default: null },
  note: { type: String, trim: true, maxlength: 280, default: "" },
  commit: { type: mongoose.Schema.Types.ObjectId, ref: "BoardCommit", default: null }
}, { timestamps: true, versionKey: false });

boardProposalSchema.index({ board: 1, status: 1, createdAt: -1 });
boardProposalSchema.index({ board: 1, author: 1, status: 1 });

export default mongoose.model("BoardProposal", boardProposalSchema);
