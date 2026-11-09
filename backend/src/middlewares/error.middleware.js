import { ZodError } from "zod";
import { env } from "../config/env.js";

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error?.code === 11000) {
    return res.status(409).json({
      success: false,
      error: { code: "DUPLICATE_VALUE", message: "An account with these details already exists" }
    });
  }

  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Please check the submitted fields",
        details: error.flatten().fieldErrors
      }
    });
  }

  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const code = error.code && typeof error.code === "string"
    ? error.code
    : "INTERNAL_SERVER_ERROR";

  if (statusCode >= 500) {
    console.error("[api:error]", error);
  }

  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: statusCode >= 500 && env.NODE_ENV === "production"
        ? "Something went wrong. Please try again."
        : error.message || "Internal server error",
      ...(error.details ? { details: error.details } : {}),
      ...(env.NODE_ENV !== "production" && statusCode >= 500 ? { stack: error.stack } : {})
    }
  });
}
