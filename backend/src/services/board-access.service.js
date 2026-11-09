import mongoose from "mongoose";
import Board from "../models/Board.model.js";
import BoardShare from "../models/BoardShare.model.js";
import { hashToken } from "../utils/crypto.js";
import { ApiError } from "../utils/ApiError.js";

export async function getBoardAccess({ boardId, userId, shareToken = null }) {
  if (!mongoose.isValidObjectId(boardId)) {
    throw new ApiError(400, "Invalid board ID.", "BOARD_ID_INVALID");
  }

  const board = await Board.findById(boardId);
  if (!board) throw new ApiError(404, "Board not found.", "BOARD_NOT_FOUND");

  if (String(board.owner) === String(userId)) {
    return { board, role: "owner", share: null };
  }

  const member = board.members.find((entry) => String(entry.user) === String(userId));
  if (member) return { board, role: member.role, share: null };

  if (shareToken) {
    const share = await BoardShare.findOne({ tokenHash: hashToken(shareToken) }).select("+tokenHash");
    const isValid = share
      && String(share.board) === String(board._id)
      && !share.revokedAt
      && (!share.expiresAt || share.expiresAt > new Date());
    if (isValid) {
      await BoardShare.updateOne({ _id: share._id }, { $set: { lastUsedAt: new Date() } });
      return { board, role: share.permission, share };
    }
  }

  throw new ApiError(403, "You don't have access to this board.", "BOARD_ACCESS_DENIED");
}

export function assertCanEdit(role) {
  if (role === "viewer") {
    throw new ApiError(403, "This share link only allows viewing.", "BOARD_READ_ONLY");
  }
}
