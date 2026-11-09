import { createServer } from "node:http";
import { env } from "./config/env.js";
import app from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { attachCollaborationSocket } from "./sockets/collaboration.socket.js";
import { shutdownCollaboration } from "./services/collaboration.service.js";

const httpServer = createServer(app);
const io = attachCollaborationSocket(httpServer, env);
app.set("io", io);

async function start() {
  await connectDatabase();
  httpServer.listen(env.PORT, () => {
    console.log(`[server] Arcdraw API listening on http://localhost:${env.PORT}`);
    console.log(`[server] Environment: ${env.NODE_ENV}`);
    console.log(`[server] Google OAuth: ${env.GOOGLE_OAUTH_ENABLED ? "configured" : "not configured"}`);
    console.log(`[server] GitHub OAuth: ${env.GITHUB_OAUTH_ENABLED ? "configured" : "not configured"}`);
    console.log(`[server] Email delivery: ${env.EMAIL_ENABLED ? "configured" : "development mode / not configured"}`);
    console.log("[server] Live collaboration: Socket.IO enabled");
  });
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received; shutting down`);
  // Never hang a deploy: leave after 15 seconds even if sockets linger.
  setTimeout(() => process.exit(1), 15000).unref();
  io.close(async () => {
    await shutdownCollaboration();
    await disconnectDatabase();
    process.exit(0);
  });
}

process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[server] Uncaught exception:", error);
  shutdown("uncaughtException");
});
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start().catch((error) => {
  console.error("[server] Startup failed:", error);
  process.exit(1);
});
