import mongoose from "mongoose";

const boardDocumentSchema = new mongoose.Schema({
  board: { type: mongoose.Schema.Types.ObjectId, ref: "Board", required: true, unique: true },
  snapshot: { type: Buffer, required: true },
  byteLength: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

export default mongoose.model("BoardDocument", boardDocumentSchema);
