import mongoose from "mongoose";

const desktopAuthCodeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true }
}, { timestamps: true, versionKey: false });

desktopAuthCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("DesktopAuthCode", desktopAuthCodeSchema);
