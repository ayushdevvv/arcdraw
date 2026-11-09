import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Always resolve backend/.env relative to this file, regardless of the terminal cwd.
const envFilePath = fileURLToPath(new URL("../../.env", import.meta.url));
dotenv.config({ path: envFilePath });

const booleanFromEnv = (defaultValue) =>
  z.preprocess((value) => {
    if (value === undefined || value === "") return defaultValue;
    if (typeof value === "boolean") return value;
    return String(value).toLowerCase() === "true";
  }, z.boolean());

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional()
);

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(32, "Secret must be at least 32 characters").optional()
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/arcdraw"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_ISSUER: z.string().default("arcdraw-api"),
  JWT_AUDIENCE: z.string().default("arcdraw-client"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  CLIENT_URL: z.string().url().default("http://localhost:5173"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  API_PUBLIC_URL: z.string().url().default("http://localhost:5000"),
  COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("lax"),
  COOKIE_SECURE: booleanFromEnv(false),
  COOKIE_DOMAIN: optionalString,
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_CALLBACK_URL: z.string().url().default("http://localhost:5000/api/v1/auth/google/callback"),
  GITHUB_CLIENT_ID: optionalString,
  GITHUB_CLIENT_SECRET: optionalString,
  GITHUB_CALLBACK_URL: z.string().url().default("http://localhost:5000/api/v1/auth/github/callback"),
  OTP_HASH_SECRET: optionalSecret,
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanFromEnv(false),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  MAIL_FROM: z.string().default("Arcdraw <no-reply@example.com>"),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  TAVILY_API_KEY: optionalString,
  AI_API_KEY: optionalString,
  AI_API_BASE_URL: z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional()),
  AI_MODEL: z.string().default("openai/gpt-oss-120b"),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(10000).max(120000).default(45000)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(`Expected environment file: ${envFilePath}`);
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const values = parsed.data;

if (values.COOKIE_SAME_SITE === "none" && !values.COOKIE_SECURE) {
  console.error("COOKIE_SECURE must be true when COOKIE_SAME_SITE=none.");
  process.exit(1);
}

if (values.NODE_ENV === "production" && !values.COOKIE_SECURE) {
  console.error("COOKIE_SECURE must be true in production (HTTPS required).");
  process.exit(1);
}

if (values.NODE_ENV === "production") {
  const local = /localhost|127\.0\.0\.1/;
  if (local.test(values.CLIENT_URL) || values.CORS_ORIGINS.split(",").some((origin) => local.test(origin))) {
    console.error("CLIENT_URL and CORS_ORIGINS must point at your deployed frontend in production, not localhost.");
    process.exit(1);
  }
}

export const env = Object.freeze({
  ...values,
  CORS_ORIGINS: values.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
  GOOGLE_OAUTH_ENABLED: Boolean(values.GOOGLE_CLIENT_ID && values.GOOGLE_CLIENT_SECRET),
  GITHUB_OAUTH_ENABLED: Boolean(values.GITHUB_CLIENT_ID && values.GITHUB_CLIENT_SECRET),
  OTP_HASH_SECRET: values.OTP_HASH_SECRET || values.JWT_ACCESS_SECRET,
  EMAIL_ENABLED: Boolean(values.SMTP_HOST && values.SMTP_USER && values.SMTP_PASS)
});
