import { asyncHandler } from "../utils/asyncHandler.js";
import { getBoardAccess } from "../services/board-access.service.js";
import { getDocumentScene } from "../services/collaboration.service.js";

export const openShareLink = asyncHandler(async (req, res) => {
  const { board, role } = await getBoardAccess({
    boardId: req.shareBoardId,
    userId: req.auth.userId,
    shareToken: req.shareToken
  });
  const scene = await getDocumentScene(board._id);
  res.json({
    success: true,
    data: {
      board: {
        id: String(board._id), title: board.title, kind: board.kind || "board", owner: String(board.owner),
        workMode: board.workMode || "live",
        role, updatedAt: board.updatedAt
      },
      scene
    }
  });
});
