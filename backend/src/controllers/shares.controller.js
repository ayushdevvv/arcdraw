import { asyncHandler } from "../utils/asyncHandler.js";
import { getBoardAccess } from "../services/board-access.service.js";
import { getDocumentScene } from "../services/collaboration.service.js";
import BoardJoinRequest from "../models/BoardJoinRequest.model.js";

export const openShareLink = asyncHandler(async (req, res) => {
  const { board, role } = await getBoardAccess({
    boardId: req.shareBoardId,
    userId: req.auth?.userId || null,
    shareToken: req.shareToken
  });
  const scene = await getDocumentScene(board._id);
  const isMember = Boolean(req.auth?.userId && (String(board.owner) === String(req.auth.userId) || board.members.some((entry) => String(entry.user) === String(req.auth.userId))));
  const joinRequest = req.auth?.userId && !isMember
    ? await BoardJoinRequest.findOne({ board: board._id, user: req.auth.userId }).select("status").lean()
    : null;
  res.json({
    success: true,
    data: {
      board: {
        id: String(board._id), title: board.title, kind: board.kind || "board", owner: String(board.owner),
        workMode: board.workMode || "live",
        visibility: board.visibility || "private",
        joinStatus: isMember ? "joined" : (joinRequest?.status || null),
        role: isMember ? role : "viewer", updatedAt: board.updatedAt
      },
      scene
    }
  });
});
