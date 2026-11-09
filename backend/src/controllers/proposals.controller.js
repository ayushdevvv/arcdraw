import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { getBoardAccess, assertCanEdit } from "../services/board-access.service.js";
import {
  listProposals, previewProposal, acceptProposal, rejectProposal,
  withdrawProposal, countPendingProposals
} from "../services/proposal.service.js";
import { notifyBoardUsers } from "../sockets/collaboration.socket.js";

const STATUSES = ["pending", "accepted", "rejected", "withdrawn"];

function shareTokenFrom(req) {
  return req.get("x-board-share-token") || req.body?.shareToken || null;
}

async function requireOwner(req) {
  const access = await getBoardAccess({
    boardId: req.params.boardId,
    userId: req.auth.userId,
    shareToken: shareTokenFrom(req)
  });
  if (access.role !== "owner") {
    throw new ApiError(403, "Only the room owner can do this.", "OWNER_ONLY");
  }
  return access;
}

export const getProposals = asyncHandler(async (req, res) => {
  const { board, role } = await getBoardAccess({
    boardId: req.params.boardId,
    userId: req.auth.userId,
    shareToken: shareTokenFrom(req)
  });
  const status = STATUSES.includes(req.query.status) ? req.query.status : null;
  const proposals = await listProposals({
    boardId: board._id,
    // Owners see every request. Everyone else only sees their own.
    authorId: role === "owner" ? null : req.auth.userId,
    status,
    limit: Number(req.query.limit) || 50
  });
  const pendingCount = role === "owner" ? await countPendingProposals(board._id) : undefined;
  res.json({ success: true, data: { proposals, ...(pendingCount === undefined ? {} : { pendingCount }) } });
});

export const getProposalPreview = asyncHandler(async (req, res) => {
  const { board } = await requireOwner(req);
  const preview = await previewProposal({ boardId: board._id, proposalId: req.params.proposalId });
  res.json({ success: true, data: { preview } });
});

export const acceptProposalRequest = asyncHandler(async (req, res) => {
  const { board } = await requireOwner(req);
  const result = await acceptProposal({
    boardId: board._id,
    proposalId: req.params.proposalId,
    ownerId: req.auth.userId
  });
  const io = req.app.get("io");
  if (io) {
    // Everyone in the room receives the merged changes as a normal live update.
    io.to(`board:${String(board._id)}`).emit("board:update", {
      update: result.update.toString("base64"),
      sourceUserId: req.auth.userId,
      source: "merge"
    });
    await notifyBoardUsers(io, board._id, {
      userIds: [result.authorId],
      includeOwners: true
    }, "board:proposal:resolved", { proposal: result.proposal });
  }
  res.json({ success: true, data: { proposal: result.proposal } });
});

export const rejectProposalRequest = asyncHandler(async (req, res) => {
  const parsed = z.object({ note: z.string().trim().max(280).optional() }).safeParse(req.body || {});
  if (!parsed.success) throw new ApiError(400, "The note can be up to 280 characters.", "NOTE_INVALID");
  const { board } = await requireOwner(req);
  const result = await rejectProposal({
    boardId: board._id,
    proposalId: req.params.proposalId,
    ownerId: req.auth.userId,
    note: parsed.data.note || ""
  });
  const io = req.app.get("io");
  if (io) {
    await notifyBoardUsers(io, board._id, {
      userIds: [result.authorId],
      includeOwners: true
    }, "board:proposal:resolved", { proposal: result.proposal });
  }
  res.json({ success: true, data: { proposal: result.proposal } });
});

export const withdrawProposalRequest = asyncHandler(async (req, res) => {
  const { board, role } = await getBoardAccess({
    boardId: req.params.boardId,
    userId: req.auth.userId,
    shareToken: shareTokenFrom(req)
  });
  assertCanEdit(role);
  const result = await withdrawProposal({
    boardId: board._id,
    proposalId: req.params.proposalId,
    authorId: req.auth.userId
  });
  const io = req.app.get("io");
  if (io) {
    await notifyBoardUsers(io, board._id, { userIds: [], includeOwners: true }, "board:proposal:resolved", { proposal: result.proposal });
  }
  res.json({ success: true, data: { proposal: result.proposal } });
});
