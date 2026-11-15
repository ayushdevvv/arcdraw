import mongoose from "mongoose";

const refreshSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false
    },
    expiresAt: {
      type: Date,
      required: true
    },
    revokedAt: {
      type: Date,
      default: null
    },
    replacedByTokenHash: {
      type: String,
      default: null,
      select: false
    },
    userAgent: {
      type: String,
      maxlength: 500,
      default: null
    },
    ipAddress: {
      type: String,
      maxlength: 100,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshSessionSchema.index({ user: 1, revokedAt: 1 });

const RefreshSession = mongoose.model("RefreshSession", refreshSessionSchema);
export default RefreshSession;
