import mongoose from "mongoose";

const oauthAttemptSchema = new mongoose.Schema({
  provider: { type: String, enum: ["google", "github"], required: true },
  stateHash: { type: String, required: true, unique: true, index: true },
  nonce: { type: String, default: null, select: false },
  codeVerifier: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true, expires: 0 }
}, { versionKey: false });

export default mongoose.models.OAuthAttempt || mongoose.model("OAuthAttempt", oauthAttemptSchema);
