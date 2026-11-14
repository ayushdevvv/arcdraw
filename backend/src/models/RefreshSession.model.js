import mongoose from "mongoose";

// Authentication sessions do not expire automatically. They remain valid
// until the user signs out or explicitly signs out of all devices.
const refreshSessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  revokedAt: { type: Date, default: null },
  userAgent: { type: String, maxlength: 500, default: null },
  ipAddress: { type: String, maxlength: 100, default: null }
}, { timestamps: true, versionKey: false });

refreshSessionSchema.index({ user: 1, revokedAt: 1 });

const RefreshSession = mongoose.model("RefreshSession", refreshSessionSchema);
export default RefreshSession;
