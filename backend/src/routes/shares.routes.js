import express from "express";
import BoardShare from "../models/BoardShare.model.js";
import { hashToken } from "../utils/crypto.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAccount } from "../middlewares/auth.middleware.js";
import { openShareLink, requestWorkspaceJoin } from "../controllers/shares.controller.js";

const router = express.Router();
router.use(requireAccount);
router.post("/request-join", requestWorkspaceJoin);
router.post("/resolve", asyncHandler(async (req, res, next) => {
  const token = req.body?.token;
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32,100}$/.test(token)) {
    throw new ApiError(404, "Share link not found.", "SHARE_NOT_FOUND");
  }
  const share = await BoardShare.findOne({ tokenHash: hashToken(token) }).select("+tokenHash");
  if (!share || share.revokedAt || (share.expiresAt && share.expiresAt <= new Date())) {
    throw new ApiError(404, "This share link is expired or has been revoked.", "SHARE_NOT_FOUND");
  }
  req.shareBoardId = String(share.board);
  req.shareToken = token;
  req.share = share;
  next();
}), openShareLink);
export default router;
