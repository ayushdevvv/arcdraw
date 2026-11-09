import mongoose from "mongoose";

const memberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  role: { type: String, enum: ["editor", "viewer"], default: "editor" },
  joinedAt: { type: Date, default: Date.now }
}, { _id: false });

const boardSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
  kind: { type: String, enum: ["board", "notes"], default: "board" },
  // "live": every editor changes the room in real time.
  // "commit": only the owner changes the room directly. Editors work on a private
  // draft and submit it for the owner to review and merge.
  workMode: { type: String, enum: ["live", "commit"], default: "live" },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  members: { type: [memberSchema], default: [] },
  sourceLocalId: { type: String, default: null },
  lastCommitAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });

boardSchema.index({ owner: 1, sourceLocalId: 1 });
boardSchema.index({ "members.user": 1 });

export default mongoose.model("Board", boardSchema);
