import OAuthAttempt from "../models/OAuthAttempt.model.js";
import { hashToken } from "../utils/crypto.js";

const OAUTH_ATTEMPT_TTL_MS = 10 * 60 * 1000;
let indexesPromise;

async function ensureOAuthAttemptIndexes() {
  // Production disables Mongoose autoIndex; create these indexes explicitly so
  // state hashes stay unique and expired OAuth attempts are cleaned up by MongoDB.
  if (!indexesPromise) {
    indexesPromise = Promise.all([
      OAuthAttempt.collection.createIndex({ stateHash: 1 }, { unique: true }),
      OAuthAttempt.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    ]).catch((error) => {
      indexesPromise = null;
      throw error;
    });
  }
  await indexesPromise;
}

export async function saveOAuthAttempt({ provider, state, nonce = null, codeVerifier }) {
  if (!state || !codeVerifier) throw new Error("OAuth attempt is incomplete");
  await ensureOAuthAttemptIndexes();
  await OAuthAttempt.create({
    provider,
    stateHash: hashToken(state),
    nonce,
    codeVerifier,
    expiresAt: new Date(Date.now() + OAUTH_ATTEMPT_TTL_MS)
  });
}

export async function consumeOAuthAttempt(provider, state) {
  if (typeof state !== "string" || state.length < 32 || state.length > 80) return null;
  return OAuthAttempt.findOneAndDelete({
    provider,
    stateHash: hashToken(state),
    expiresAt: { $gt: new Date() }
  }).select("+nonce +codeVerifier");
}
