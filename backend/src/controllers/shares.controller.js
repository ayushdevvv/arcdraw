import Board from "../models/Board.model.js";
import BoardJoinRequest from "../models/BoardJoinRequest.model.js";
import BoardShare from "../models/BoardShare.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { hashToken } from "../utils/crypto.js";
import { getDocumentScene } from "../services/collaboration.service.js";

function validateShareToken(token) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32,100}$/.test(token)) {
    throw new ApiError(404, "Share link not found.", "SHARE_NOT_FOUND");
  }
}

async function findActiveShare(token) {
  validateShareToken(token);
  const share = await BoardShare.findOne({ tokenHash: hashToken(token) }).select("+tokenHash");
  if (!share || share.revokedAt || (share.expiresAt && share.expiresAt <= new Date())) {
    throw new ApiError(404, "This share link is expired or has been revoked.", "SHARE_NOT_FOUND");
  }
  return share;
}

export const openShareLink = asyncHandler(async (req, res) => {
  const share = req.share;
  const board = await Board.findById(share.board);
  if (!board) throw new ApiError(404, "Workspace not found.", "BOARD_NOT_FOUND");

  const userId = String(req.auth.userId);
  const owner = String(board.owner) === userId;
  const member = board.members.find((entry) => String(entry.user) === userId);
  const joinRequest = !owner && !member && share.permission === "editor"
    ? await BoardJoinRequest.findOne({ board: board._id, user: req.auth.userId }).select("status")
    : null;
  const role = owner ? "owner" : member ? member.role : share.permission === "viewer" ? "viewer" : "invited";
  const scene = await getDocumentScene(board._id);
  await BoardShare.updateOne({ _id: share._id }, { $set: { lastUsedAt: new Date() } });

  res.json({
    success: true,
    data: {
      board: {
        id: String(board._id),
        title: board.title,
        kind: board.kind || "board",
        owner: String(board.owner),
        workMode: board.workMode || "live",
        role,
        joinStatus: role === "invited" ? (joinRequest?.status || "not_requested") : "joined",
        updatedAt: board.updatedAt
      },
      scene
    }
  });
});

export const requestWorkspaceJoin = asyncHandler(async (req, res) => {
  const share = await findActiveShare(req.body?.token);
  if (share.permission !== "editor") {
    throw new ApiError(403, "This is a view-only link. Ask the owner for an edit link.", "VIEW_ONLY_LINK");
  }

  const board = await Board.findById(share.board);
  if (!board) throw new ApiError(404, "Workspace not found.", "BOARD_NOT_FOUND");
  const userId = String(req.auth.userId);
  if (String(board.owner) === userId || board.members.some((entry) => String(entry.user) === userId)) {
    return res.json({ success: true, data: { status: "joined", role: "editor" } });
  }

  const requestFilter = { board: board._id, user: req.auth.userId };
  const requestUpdate = {
    $set: {
      share: share._id,
      status: "pending",
      requestedAt: new Date(),
      reviewedAt: null,
      reviewedBy: null
    }
  };
  let request;
  try {
    request = await BoardJoinRequest.findOneAndUpdate(requestFilter, requestUpdate, {
      new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true
    });
  } catch (error) {
    // Two tabs can submit at once; the unique index lets one create while the
    // other safely updates the same request instead of surfacing E11000.
    if (error.code !== 11000) throw error;
    request = await BoardJoinRequest.findOneAndUpdate(requestFilter, requestUpdate, {
      new: true, runValidators: true
    });
  }

  res.status(202).json({
    success: true,
    data: { status: request.status, requestId: String(request._id) }
  });
});
