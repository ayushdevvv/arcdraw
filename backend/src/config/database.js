import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDatabase() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGODB_URI, {
    autoIndex: env.NODE_ENV !== "production",
    serverSelectionTimeoutMS: 10000
  });

  console.log(`[database] Connected to MongoDB (${mongoose.connection.name})`);
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
