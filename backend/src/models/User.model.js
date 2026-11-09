import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254
    },
    passwordHash: {
      type: String,
      select: false,
      default: undefined
    },
    passwordEnabled: {
      type: Boolean,
      default: false
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
      default: undefined
    },
    githubId: {
      type: String,
      unique: true,
      sparse: true,
      default: undefined
    },
    githubUsername: {
      type: String,
      default: null
    },
    avatarUrl: {
      type: String,
      default: null
    },
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    emailVerificationOtpHash: {
      type: String,
      select: false,
      default: undefined
    },
    emailVerificationOtpExpiresAt: {
      type: Date,
      select: false,
      default: undefined
    },
    emailVerificationOtpSentAt: {
      type: Date,
      select: false,
      default: undefined
    },
    emailVerificationOtpAttempts: {
      type: Number,
      default: 0,
      select: false
    },
    passwordResetOtpHash: {
      type: String,
      select: false,
      default: undefined
    },
    passwordResetOtpExpiresAt: {
      type: Date,
      select: false,
      default: undefined
    },
    passwordResetOtpSentAt: {
      type: Date,
      select: false,
      default: undefined
    },
    passwordResetOtpAttempts: {
      type: Number,
      default: 0,
      select: false
    },
    lastLoginAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);


const User = mongoose.model("User", userSchema);
export default User;
