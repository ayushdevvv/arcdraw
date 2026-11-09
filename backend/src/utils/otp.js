import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

export const OTP_LENGTH = 8;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

export function createOtp() {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

export function hashOtp(email, purpose, otp) {
  return createHmac("sha256", env.OTP_HASH_SECRET)
    .update(`${purpose}:${email.toLowerCase()}:${otp}`)
    .digest("hex");
}

export function verifyOtpHash(expectedHash, candidateHash) {
  if (!expectedHash || !candidateHash) return false;
  const expected = Buffer.from(expectedHash, "hex");
  const candidate = Buffer.from(candidateHash, "hex");
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}
