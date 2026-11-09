import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import authRoutes from "./routes/auth.routes.js";
import boardsRoutes from "./routes/boards.routes.js";
import sharesRoutes from "./routes/shares.routes.js";
import agentRoutes from "./routes/agent.routes.js";
import { enforceAllowedOrigin } from "./middlewares/origin.middleware.js";
import { notFoundHandler } from "./middlewares/not-found.middleware.js";
import { errorHandler } from "./middlewares/error.middleware.js";

const app = express();

if (env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.CORS_ORIGINS.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Board-Share-Token"]
}));
app.use(enforceAllowedOrigin);
app.use(express.json({ limit: "16mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      name: "arcdraw-api",
      status: "healthy",
      timestamp: new Date().toISOString()
    }
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/boards", boardsRoutes);
app.use("/api/v1/shares", sharesRoutes);
app.use("/api/v1/agent", agentRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
