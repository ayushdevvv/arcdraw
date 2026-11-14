import mongoose from "mongoose";
import { env } from "./env.js";
import BoardJoinRequest from "../models/BoardJoinRequest.model.js";
import RefreshSession from "../models/RefreshSession.model.js";

export async function connectDatabase() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGODB_URI, {
    autoIndex: env.NODE_ENV !== "production",
    serverSelectionTimeoutMS: 10000
  });

  // Ensure approval requests have a unique board/user key even when production
  // disables Mongoose autoIndex. This prevents duplicate pending requests.
  await BoardJoinRequest.createIndexes();
  await RefreshSession.createIndexes();

  // Remove TTL/refresh-token indexes from older deployments. Existing login
  // sessions should remain valid until explicit sign-out, not be deleted by MongoDB.
  const sessionCollection = mongoose.connection.collection("refreshsessions");
  const indexes = await sessionCollection.indexes().catch(() => []);
  if (indexes.some((index) => index.name === "expiresAt_1")) {
    // Retire records that had already expired under the previous release before
    // removing the TTL index. Sessions still valid at deploy remain active.
    await sessionCollection.updateMany(
      { expiresAt: { $lte: new Date() }, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
  }
  for (const legacyIndex of ["expiresAt_1", "tokenHash_1"]) {
    if (indexes.some((index) => index.name === legacyIndex)) {
      await sessionCollection.dropIndex(legacyIndex).catch((error) => {
        if (error.code !== 27 && error.codeName !== "IndexNotFound") throw error;
      });
    }
  }

  console.log(`[database] Connected to MongoDB (${mongoose.connection.name})`);
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
