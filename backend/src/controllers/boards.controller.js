import mongoose from "mongoose";
import { z } from "zod";
import Board from "../models/Board.model.js";
import BoardShare from "../models/BoardShare.model.js";
import BoardJoinRequest from "../models/BoardJoinRequest.model.js";
import BoardDocument from "../models/BoardDocument.model.js";
import { createOpaqueToken, hashToken } from "../utils/crypto.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { assertCanEdit, getBoardAccess } from "../services/board-access.service.js";
import { revokeBoardShareSockets } from "../sockets/collaboration.socket.js";
import {
  createBoardCommit,
  createBoardDocument,
  getDocumentScene,
  listBoardCommits,
  restoreBoardCommit
} from "../services/collaboration.service.js";

const sceneSchema = z.object({
  elements: z.array(z.any()).max(50000).default([]),
  appState: z.record(z.string(), z.any()).optional(),
  files: z.record(z.string(), z.any()).optional(),
  designStudio: z.object({
    tokens: z.array(z.any()).max(100).optional(),
    components: z.array(z.any()).max(100).optional()
  }).optional()
});

const noteSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().max(120).optional(),
  content: z.string().max(500000).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  linkedElementId: z.string().nullable().optional()
});

const projectItemSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(["task", "milestone"]).optional(),
  title: z.string().max(120).optional(),
  description: z.string().max(3000).optional(),
  status: z.string().max(40).optional(),
  priority: z.string().max(20).optional(),
  assigneeId: z.string().max(100).nullable().optional(),
  assigneeName: z.string().max(120).nullable().optional(),
  dueDate: z.string().nullable().optional(),
  milestoneId: z.string().max(100).nullable().optional(),
  linkedElementId: z.string().max(100).nullable().optional(),
  linkedNoteId: z.string().max(100).nullable().optional(),
  parentTaskId: z.string().max(100).nullable().optional(),
  dependsOnIds: z.array(z.string().max(100)).max(100).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  deletedAt: z.string().nullable().optional()
});

const createBoardSchema = z.object({
  title: z.string().trim().min(1).max(100),
  kind: z.enum(["board", "notes"]).optional().default("board"),
  visibility: z.enum(["private", "public"]).optional().default("private"),
  sourceLocalId: z.string().min(1).max(100),
  scene: sceneSchema,
  notes: z.array(noteSchema).max(500).optional().default([]),
  projectItems: z.array(projectItemSchema).max(2000).optional().default([])
});

const shareSchema = z.object({
  permission: z.enum(["viewer", "editor"]).default("viewer"),
  expiresInDays: z.number().int().min(1).max(90).nullable().optional(),
  shareToken: z.string().optional()
});

const commitSchema = z.object({
  message: z.string().trim().min(1).max(140)
});

function boardDto(board, role) {
  return {
    id: String(board._id),
    title: board.title,
    kind: board.kind || "board",
    visibility: board.visibility || "private",
    workMode: board.workMode || "live",
    owner: String(board.owner),
    role,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
    lastCommitAt: board.lastCommitAt
  };
}

export const createCloudBoard = asyncHandler(async (req, res) => {
  const parsed = createBoardSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Invalid board payload.", "BOARD_PAYLOAD_INVALID", parsed.error.flatten());

  const { title, kind, visibility, sourceLocalId, scene, notes, projectItems } = parsed.data;
  const completeScene = { ...scene, notes, projectItems };
  let board = await Board.findOne({ owner: req.auth.userId, sourceLocalId });
  if (!board) {
    board = await Board.create({ title, kind, visibility, owner: req.auth.userId, sourceLocalId });
    await createBoardDocument(board._id, completeScene);
  } else {
    board.title = title;
    board.kind = kind;
    board.visibility = visibility;
    await board.save();
    const documentExists = await BoardDocument.exists({ board: board._id });
    if (!documentExists) await createBoardDocument(board._id, completeScene);
  }

  const currentScene = await getDocumentScene(board._id);
  res.status(201).json({ success: true, data: { board: boardDto(board, "owner"), scene: currentScene } });
});

export const getCloudBoard = asyncHandler(async (req, res) => {
  const { board, role } = await getBoardAccess({ boardId: req.params.boardId, userId: req.auth.userId });
  const scene = await getDocumentScene(board._id);
  res.json({ success: true, data: { board: boardDto(board, role), scene } });
});

export const updateBoardSettings = asyncHandler(async (req, res) => {
  const parsed = z.object({ workMode: z.enum(["live", "commit"]) }).safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Choose live or commit mode.", "WORK_MODE_INVALID");
  const { board, role } = await getBoardAccess({ boardId: req.params.boardId, userId: req.auth.userId });
  if (role !== "owner") {
    throw new ApiError(403, "Only the owner can change how this room works.", "OWNER_ONLY");
  }
  const changed = (board.workMode || "live") !== parsed.data.workMode;
  board.workMode = parsed.data.workMode;
  await board.save();
  const io = req.app.get("io");
  if (io && changed) {
    io.to(`board:${String(board._id)}`).emit("board:mode", {
      boardId: String(board._id),
      workMode: board.workMode
    });
  }
  res.json({ success: true, data: { board: boardDto(board, role) } });
});

export const updateBoardVisibility = asyncHandler(async (req, res) => {
  const parsed = z.object({ visibility: z.enum(["private", "public"]) }).safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Choose public or private access.", "ROOM_VISIBILITY_INVALID");
  const { board, role } = await getBoardAccess({ boardId: req.params.boardId, userId: req.auth.userId });
  if (role !== "owner") throw new ApiError(403, "Only the room owner can change access.", "OWNER_ONLY");
  board.visibility = parsed.data.visibility;
  await board.save();
  res.json({ success: true, data: { board: boardDto(board, role) } });
});

export const requestToJoinBoard = asyncHandler(async (req, res) => {
  const token = typeof req.body?.shareToken === "string" ? req.body.shareToken : null;
  const { board, role } = await getBoardAccess({ boardId: req.params.boardId, userId: req.auth.userId, shareToken: token });
  if (role === "owner" || role === "editor") {
    return res.json({ success: true, data: { status: "joined", role } });
  }
  const existingMember = board.members.find((entry) => String(entry.user) === String(req.auth.userId));

  // Public rooms immediately promote a previously view-only member as well.
  if ((board.visibility || "private") === "public") {
    if (existingMember) existingMember.role = "editor";
    else board.members.push({ user: req.auth.userId, role: "editor" });
    await board.save();
    await BoardJoinRequest.updateOne(
      { board: board._id, user: req.auth.userId },
      { $set: { status: "approved", resolvedAt: new Date(), resolvedBy: board.owner } }
    );
    return res.json({ success: true, data: { status: "joined", role: "editor" } });
  }

  let request = await BoardJoinRequest.findOne({ board: board._id, user: req.auth.userId });
  let shouldNotifyOwner = false;
  if (!request) {
    request = await BoardJoinRequest.create({ board: board._id, user: req.auth.userId, status: "pending" });
    shouldNotifyOwner = true;
  } else if (request.status !== "pending") {
    request.status = "pending";
    request.resolvedAt = null;
    request.resolvedBy = null;
    await request.save();
    shouldNotifyOwner = true;
  }

  // Notify every active session belonging to the owner, even when they are
  // outside this room. The owner-wide inbox endpoint is the reconnect fallback.
  if (shouldNotifyOwner) {
    const populated = await BoardJoinRequest.findById(request._id)
      .populate("user", "name email avatarUrl")
      .lean();
    const io = req.app.get("io");
    if (io) {
      io.to(`user:${String(board.owner)}`).emit("room:join-request", {
        id: String(request._id),
        status: request.status,
        createdAt: request.createdAt,
        user: populated?.user ? {
          id: String(populated.user._id),
          name: populated.user.name,
          email: populated.user.email,
          avatarUrl: populated.user.avatarUrl || null
        } : null,
        board: { id: String(board._id), title: board.title, kind: board.kind || "board" }
      });
    }
  }

  res.status(202).json({ success: true, data: { status: request.status } });
});

export const listOwnedJoinRequests = asyncHandler(async (req, res) => {
  const ownedBoards = await Board.find({ owner: req.auth.userId }).select("_id").lean();
  const boardIds = ownedBoards.map((board) => board._id);
  if (!boardIds.length) {
    return res.json({ success: true, data: { requests: [] } });
  }

  const requests = await BoardJoinRequest.find({ board: { $in: boardIds }, status: "pending" })
    .sort({ createdAt: -1 })
    .populate("user", "name email avatarUrl")
    .populate("board", "title kind")
    .lean();

  res.json({ success: true, data: { requests: requests.map((item) => ({
    id: String(item._id),
    status: item.status,
    createdAt: item.createdAt,
    user: item.user ? {
      id: String(item.user._id),
      name: item.user.name,
      email: item.user.email,
      avatarUrl: item.user.avatarUrl || null
    } : null,
    board: item.board ? {
      id: String(item.board._id),
      title: item.board.title,
      kind: item.board.kind || "board"
    } : null
  })) } });
});

export const listJoinRequests = asyncHandler(async (req, res) => {
  const { board, role } = await getBoardAccess({ boardId: req.params.boardId, userId: req.auth.userId });
  if (role !== "owner") throw new ApiError(403, "Only the room owner can review join requests.", "OWNER_ONLY");
  const requests = await BoardJoinRequest.find({ board: board._id, status: "pending" })
    .sort({ createdAt: 1 })
    .populate("user", "name email avatarUrl")
    .lean();
  res.json({ success: true, data: { requests: requests.map((item) => ({
    id: String(item._id), status: item.status, createdAt: item.createdAt,
    user: item.user ? { id: String(item.user._id), name: item.user.name, email: item.user.email, avatarUrl: item.user.avatarUrl || null } : null
  })) } });
});

export const resolveJoinRequest = asyncHandler(async (req, res) => {
  const parsed = z.object({ decision: z.enum(["approved", "rejected"]) }).safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Choose approve or reject.", "JOIN_REQUEST_DECISION_INVALID");
  const { board, role } = await getBoardAccess({ boardId: req.params.boardId, userId: req.auth.userId });
  if (role !== "owner") throw new ApiError(403, "Only the room owner can review join requests.", "OWNER_ONLY");
  const request = await BoardJoinRequest.findOne({ _id: req.params.requestId, board: board._id, status: "pending" });
  if (!request) throw new ApiError(404, "Join request not found.", "JOIN_REQUEST_NOT_FOUND");
  if (parsed.data.decision === "approved") {
    const member = board.members.find((entry) => String(entry.user) === String(request.user));
    if (member) member.role = "editor";
    else board.members.push({ user: request.user, role: "editor" });
    await board.save();
  }
  request.status = parsed.data.decision;
  request.resolvedAt = new Date();
  request.resolvedBy = req.auth.userId;
  await request.save();

  const io = req.app.get("io");
  if (io) {
    const resolution = {
      boardId: String(board._id),
      requestId: String(request._id),
      status: request.status,
      boardTitle: board.title
    };
    io.to(`user:${String(request.user)}`).emit("room:join-request:resolved", resolution);
    io.to(`user:${String(board.owner)}`).emit("room:join-request:resolved", resolution);
  }
  res.json({ success: true, data: { status: request.status } });
});

export const renameCloudBoard = asyncHandler(async (req, res) => {
  const parsed = z.object({ title: z.string().trim().min(1).max(100) }).safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Board title must be 1–100 characters.", "BOARD_TITLE_INVALID");
  const { board, role } = await getBoardAccess({ boardId: req.params.boardId, userId: req.auth.userId, shareToken: req.body?.shareToken || null });
  assertCanEdit(role);
  board.title = parsed.data.title;
  await board.save();
  res.json({ success: true, data: { board: boardDto(board, role) } });
});

export const createShareLink = asyncHandler(async (req, res) => {
  const parsed = shareSchema.safeParse(req.body || {});
  if (!parsed.success) throw new ApiError(400, "Invalid share settings.", "SHARE_SETTINGS_INVALID");
  const { board, role } = await getBoardAccess({ boardId: req.params.boardId, userId: req.auth.userId, shareToken: parsed.data.shareToken || null });
  assertCanEdit(role);

  const token = createOpaqueToken(32);
  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
    : null;
  const share = await BoardShare.create({
    board: board._id,
    createdBy: req.auth.userId,
    tokenHash: hashToken(token),
    permission: "viewer",
    expiresAt
  });

  const baseUrl = process.env.CLIENT_URL || "http://localhost:5173";
  const url = `${baseUrl.replace(/\/$/, "")}/#/share/${token}`;
  res.status(201).json({
    success: true,
    data: {
      share: { id: String(share._id), permission: "viewer", expiresAt: share.expiresAt },
      url
    }
  });
});

export const listShareLinks = asyncHandler(async (req, res) => {
  const { board, role } = await getBoardAccess({ boardId: req.params.boardId, userId: req.auth.userId, shareToken: req.get("x-board-share-token") || null });
  assertCanEdit(role);
  const now = new Date();
  const shares = await BoardShare.find({
    board: board._id,
    revokedAt: null,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
  })
    .sort({ createdAt: -1 })
    .select("permission expiresAt createdAt lastUsedAt revokedAt")
    .lean();
  res.json({ success: true, data: { shares: shares.map((share) => ({
    id: String(share._id), permission: share.permission, expiresAt: share.expiresAt,
    createdAt: share.createdAt, lastUsedAt: share.lastUsedAt
  })) } });
});

export const revokeShareLink = asyncHandler(async (req, res) => {
  const { board, role } = await getBoardAccess({ boardId: req.params.boardId, userId: req.auth.userId, shareToken: req.body?.shareToken || null });
  assertCanEdit(role);
  const result = await BoardShare.updateOne(
    { _id: req.params.shareId, board: board._id, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  if (!result.modifiedCount) throw new ApiError(404, "Share link not found.", "SHARE_NOT_FOUND");
  await revokeBoardShareSockets(req.app.get("io"), board._id, req.params.shareId);
  res.json({ success: true, message: "Share link revoked." });
});

export const getCommitHistory = asyncHandler(async (req, res) => {
  const { board } = await getBoardAccess({ boardId: req.params.boardId, userId: req.auth.userId, shareToken: req.get("x-board-share-token") || null });
  const commits = await listBoardCommits(board._id, Number(req.query.limit) || 50);
  res.json({ success: true, data: { commits } });
});

export const createCommit = asyncHandler(async (req, res) => {
  const parsed = commitSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "A commit message is required (maximum 140 characters).", "COMMIT_MESSAGE_INVALID");
  const { board, role } = await getBoardAccess({ boardId: req.params.boardId, userId: req.auth.userId, shareToken: req.body.shareToken });
  assertCanEdit(role);
  const commit = await createBoardCommit({
    boardId: board._id,
    authorId: req.auth.userId,
    message: parsed.data.message
  });
  const populated = await commit.populate("author", "name email avatarUrl");
  res.status(201).json({ success: true, data: { commit: {
    id: String(populated._id), sequence: populated.sequence, parent: populated.parent || null,
    message: populated.message, shortHash: populated.shortHash,
    kind: populated.kind, byteLength: populated.byteLength, createdAt: populated.createdAt,
    author: populated.author ? { id: String(populated.author._id), name: populated.author.name, avatarUrl: populated.author.avatarUrl } : null
  } } });
});

export const restoreCommit = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.commitId)) throw new ApiError(400, "Invalid commit ID.", "COMMIT_ID_INVALID");
  const { board, role } = await getBoardAccess({ boardId: req.params.boardId, userId: req.auth.userId, shareToken: req.body?.shareToken });
  assertCanEdit(role);
  const result = await restoreBoardCommit({ boardId: board._id, commitId: req.params.commitId, authorId: req.auth.userId });
  const io = req.app.get("io");
  if (io && result.update?.length) {
    io.to(`board:${String(board._id)}`).emit("board:update", {
      update: result.update.toString("base64"),
      source: "restore"
    });
  }
  res.json({ success: true, data: { restored: true, shortHash: result.commit.shortHash } });
});
