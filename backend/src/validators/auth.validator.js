import { z } from "zod";

const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(8).max(72).refine(
  (value) => Buffer.byteLength(value, "utf8") <= 72,
  "Password must be at most 72 bytes when encoded as UTF-8"
);
const otpSchema = z.string().regex(/^\d{8}$/, "Enter the 8-digit code sent to your email");

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: emailSchema,
  password: passwordSchema
});

export const loginSchema = z.object({ email: emailSchema, password: passwordSchema });
export const emailOnlySchema = z.object({ email: emailSchema });
export const verifyEmailOtpSchema = z.object({ email: emailSchema, otp: otpSchema });
export const resetPasswordSchema = z.object({
  email: emailSchema,
  otp: otpSchema,
  password: passwordSchema
});
