import mongoose from "mongoose";

const changeSummarySchema = new mongoose.Schema({
  elementsAdded: { type: Number, default: 0 },
  elementsUpdated: { type: Number, default: 0 },
  elementsDeleted: { type: Number, default: 0 },
  filesAdded: { type: Number, default: 0 },
  filesUpdated: { type: Number, default: 0 },
  filesDeleted: { type: Number, default: 0 },
  notesAdded: { type: Number, default: 0 },
  notesUpdated: { type: Number, default: 0 },
  notesDeleted: { type: Number, default: 0 },
  projectItemsAdded: { type: Number, default: 0 },
  projectItemsUpdated: { type: Number, default: 0 },
  projectItemsDeleted: { type: Number, default: 0 }
}, { _id: false });

const boardCommitSchema = new mongoose.Schema({
  board: { type: mongoose.Schema.Types.ObjectId, ref: "Board", required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: "BoardCommit", default: null },
  sequence: { type: Number, required: true, default: 1 },
  message: { type: String, required: true, trim: true, maxlength: 140 },
  shortHash: { type: String, required: true, index: true },
  snapshot: { type: Buffer, required: true, select: false },
  byteLength: { type: Number, default: 0 },
  changeSummary: { type: changeSummarySchema, default: () => ({}) },
  mergedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  kind: { type: String, enum: ["commit", "restore", "merge"], default: "commit" }
}, { timestamps: true, versionKey: false });

boardCommitSchema.index({ board: 1, sequence: -1 });
boardCommitSchema.index({ board: 1, createdAt: -1 });
export default mongoose.model("BoardCommit", boardCommitSchema);
