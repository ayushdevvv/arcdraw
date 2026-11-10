import { Server } from "socket.io";
import User from "../models/User.model.js";
import RefreshSession from "../models/RefreshSession.model.js";
import { AUTH_COOKIE_NAMES } from "../constants/auth.constants.js";
import { verifyAccessToken } from "../services/token.service.js";
import { getBoardAccess, assertCanEdit } from "../services/board-access.service.js";
import { applyDocumentUpdate, getDocumentSnapshot } from "../services/collaboration.service.js";
import { createProposal } from "../services/proposal.service.js";
import { ApiError } from "../utils/ApiError.js";

const MAX_UPDATE_BYTES = 7 * 1024 * 1024;

function readCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

function decodeUpdate(value) {
  if (typeof value !== "string" || value.length > Math.ceil(MAX_UPDATE_BYTES * 4 / 3) + 8) {
    throw new Error("Collaboration update is invalid or too large.");
  }
  const buffer = Buffer.from(value, "base64");
  if (!buffer.length || buffer.byteLength > MAX_UPDATE_BYTES) throw new Error("Collaboration update is invalid or too large.");
  return buffer;
}

function roomName(boardId) {
  return `board:${String(boardId)}`;
}

function clearShareExpiryTimer(socket, boardId) {
  const timer = socket.data.shareExpiryTimers?.get(String(boardId));
  if (timer) clearTimeout(timer);
  socket.data.shareExpiryTimers?.delete(String(boardId));
}

function removeSocketFromBoard(io, socket, boardId, message) {
  const id = String(boardId);
  const access = socket.data.boards?.get(id);
  if (!access) return false;
  clearShareExpiryTimer(socket, id);
  io.to(roomName(id)).emit("board:presence:leave", { userId: socket.data.userId });
  void socket.leave(roomName(id));
  socket.data.boards.delete(id);
  socket.emit("board:access:revoked", { boardId: id, message });
  return true;
}

function scheduleShareExpiry(io, socket, boardId, expiresAt) {
  clearShareExpiryTimer(socket, boardId);
  if (!expiresAt) return;
  const expiryMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiryMs)) return;

  // Node timers are limited to ~24.8 days. Re-arm long expirations in chunks
  // because share links can live for up to 90 days.
  const arm = () => {
    const remaining = expiryMs - Date.now();
    if (remaining <= 0) {
      removeSocketFromBoard(
        io,
        socket,
        boardId,
        "This share link has expired. Your local copy is still available."
      );
      return;
    }
    const timer = setTimeout(arm, Math.min(remaining, 2_147_000_000));
    timer.unref?.();
    socket.data.shareExpiryTimers.set(String(boardId), timer);
  };
  arm();
}

/**
 * Send an event to chosen people in a room instead of everyone in it.
 * Viewers and unrelated editors never see another person's review requests.
 */
export async function notifyBoardUsers(io, boardId, { userIds = [], includeOwners = false } = {}, event, payload) {
  if (!io) return;
  const id = String(boardId);
  const wanted = new Set(userIds.map(String));
  const sockets = await io.in(roomName(id)).fetchSockets();
  for (const socket of sockets) {
    const access = socket.data.boards?.get(id);
    const isWanted = wanted.has(String(socket.data.userId));
    const isOwner = includeOwners && access?.role === "owner";
    if (isWanted || isOwner) socket.emit(event, payload);
  }
}

export async function revokeBoardShareSockets(io, boardId, shareId) {
  if (!io) return;
  const id = String(boardId);
  const sockets = await io.in(roomName(id)).fetchSockets();
  for (const socket of sockets) {
    const access = socket.data.boards?.get(id);
    if (access?.shareId !== String(shareId)) continue;
    removeSocketFromBoard(
      io,
      socket,
      id,
      "This share link has been revoked. Your local copy is still available."
    );
  }
}

export function attachCollaborationSocket(httpServer, env) {
  const io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (!origin || env.CORS_ORIGINS.includes(origin)) return callback(null, true);
        return callback(new Error("Origin not allowed"));
      },
      credentials: true
    },
    maxHttpBufferSize: 10 * 1024 * 1024,
    pingInterval: 25000,
    pingTimeout: 20000
  });

  io.use(async (socket, next) => {
    try {
      const token = readCookie(socket.request.headers.cookie, AUTH_COOKIE_NAMES.access);
      if (!token) return next(new Error("Sign in to collaborate."));
      const payload = verifyAccessToken(token);
      if (!payload.sid) return next(new Error("Sign in to collaborate."));
      const session = await RefreshSession.findOne({ _id: payload.sid, user: payload.sub, revokedAt: null, expiresAt: { $gt: new Date() } }).select("_id").lean();
      if (!session) return next(new Error("Your session has expired. Sign in again."));
      const user = await User.findById(payload.sub).select("name avatarUrl").lean();
      if (!user) return next(new Error("Account not found."));
      socket.data.userId = String(user._id);
      socket.data.profile = { name: user.name, avatarUrl: user.avatarUrl || null };
      socket.data.boards = new Map();
      socket.data.shareExpiryTimers = new Map();
      return next();
    } catch {
      return next(new Error("Sign in to collaborate."));
    }
  });

  io.on("connection", (socket) => {
    socket.on("board:join", async (payload = {}, acknowledge = () => {}) => {
      try {
        const boardId = String(payload.boardId || "");
        const { board, role, share } = await getBoardAccess({
          boardId,
          userId: socket.data.userId,
          shareToken: payload.shareToken || null
        });
        const name = roomName(board._id);
        const boardKey = String(board._id);

        for (const previousBoardId of [...socket.data.boards.keys()]) {
          if (previousBoardId === boardKey) continue;
          clearShareExpiryTimer(socket, previousBoardId);
          socket.to(roomName(previousBoardId)).emit("board:presence:leave", {
            userId: socket.data.userId
          });
          socket.leave(roomName(previousBoardId));
          socket.data.boards.delete(previousBoardId);
        }

        clearShareExpiryTimer(socket, boardKey);
        socket.join(name);
        socket.data.boards.set(boardKey, {
          role,
          // Keep the bearer token only in socket memory so permissions can be
          // revalidated on every write (e.g. after a link is revoked/expired).
          shareToken: payload.shareToken || null,
          shareId: share?._id ? String(share._id) : null
        });
        if (share?.expiresAt) scheduleShareExpiry(io, socket, boardKey, share.expiresAt);

        const snapshot = await getDocumentSnapshot(board._id);
        const sockets = await io.in(name).fetchSockets();
        const participants = sockets.map((entry) => ({
          userId: entry.data.userId,
          name: entry.data.profile?.name || "Teammate",
          avatarUrl: entry.data.profile?.avatarUrl || null
        }));

        acknowledge({
          ok: true,
          board: { id: String(board._id), title: board.title },
          role,
          workMode: board.workMode || "live",
          snapshot: snapshot.toString("base64"),
          participants
        });
        socket.to(name).emit("board:presence:join", {
          userId: socket.data.userId,
          ...socket.data.profile
        });
      } catch (error) {
        acknowledge({ ok: false, message: error.message || "Couldn't join this board." });
      }
    });

    const handleUpdate = async (payload = {}, acknowledge = () => {}) => {
      try {
        const boardId = String(payload.boardId || "");
        const joinedAccess = socket.data.boards.get(boardId);
        if (!joinedAccess) throw new Error("Join the board before sending changes.");

        // Revalidate access for every write. A socket can outlive a revoked or
        // expired share link, so a role cached at join time is not sufficient.
        const { board, role } = await getBoardAccess({
          boardId,
          userId: socket.data.userId,
          shareToken: joinedAccess.shareToken
        });
        assertCanEdit(role);
        joinedAccess.role = role;

        // In commit mode only the owner changes the room directly. Editors keep
        // a private draft and submit it for review (see board:propose).
        if ((board.workMode || "live") === "commit" && role !== "owner") {
          throw new ApiError(409, "This room is in commit mode. Submit your changes for review.", "COMMIT_MODE");
        }

        const update = decodeUpdate(payload.update);
        await applyDocumentUpdate(boardId, update);
        socket.to(roomName(boardId)).emit("board:update", {
          update: update.toString("base64"),
          sourceUserId: socket.data.userId
        });
        acknowledge({ ok: true });
      } catch (error) {
        const boardId = String(payload.boardId || "");
        const joinedAccess = socket.data.boards.get(boardId);
        if (joinedAccess?.shareId && (error.statusCode === 403 || error.code === "BOARD_ACCESS_DENIED")) {
          const room = roomName(boardId);
          removeSocketFromBoard(
            io,
            socket,
            boardId,
            "This share link has expired or been revoked. Your local copy is still available."
          );
        }
        acknowledge({
          ok: false,
          code: error.code || "SYNC_FAILED",
          message: error.message || "Couldn't synchronize this change."
        });
      }
    };

    socket.on("board:update", handleUpdate);
    socket.on("board:sync", handleUpdate);

    // Commit mode: an editor submits their private draft for the owner to review.
    socket.on("board:propose", async (payload = {}, acknowledge = () => {}) => {
      try {
        const boardId = String(payload.boardId || "");
        const joinedAccess = socket.data.boards.get(boardId);
        if (!joinedAccess) throw new ApiError(403, "Join the room before submitting changes.", "NOT_JOINED");

        const now = Date.now();
        if (now - (socket.data.lastProposeAt || 0) < 2000) {
          throw new ApiError(429, "Please wait a moment before submitting again.", "RATE_LIMITED");
        }
        socket.data.lastProposeAt = now;

        const { board, role } = await getBoardAccess({
          boardId,
          userId: socket.data.userId,
          shareToken: joinedAccess.shareToken
        });
        assertCanEdit(role);
        if (role === "owner") {
          throw new ApiError(409, "As the owner, your changes already go straight to the room.", "OWNER_DIRECT");
        }
        if ((board.workMode || "live") !== "commit") {
          throw new ApiError(409, "This room is in live mode. Your changes sync automatically.", "LIVE_MODE");
        }

        const message = String(payload.message || "").trim();
        if (!message || message.length > 140) {
          throw new ApiError(400, "Describe your changes in 1 to 140 characters.", "MESSAGE_INVALID");
        }

        const proposal = await createProposal({
          boardId: board._id,
          authorId: socket.data.userId,
          message,
          update: new Uint8Array(decodeUpdate(payload.update))
        });
        await notifyBoardUsers(io, board._id, { includeOwners: true }, "board:proposal:new", { proposal });
        acknowledge({ ok: true, proposal });
      } catch (error) {
        acknowledge({
          ok: false,
          code: error.code || "PROPOSE_FAILED",
          message: error.message || "Couldn't submit your changes."
        });
      }
    });

    socket.on("board:presence", (payload = {}) => {
      const boardId = String(payload.boardId || "");
      if (!socket.data.boards.has(boardId)) return;
      const x = Number(payload.x);
      const y = Number(payload.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      socket.to(roomName(boardId)).volatile.emit("board:presence:pointer", {
        userId: socket.data.userId,
        name: socket.data.profile?.name || "Teammate",
        avatarUrl: socket.data.profile?.avatarUrl || null,
        x, y,
        updatedAt: Date.now()
      });
    });

    socket.on("disconnect", () => {
      for (const timer of socket.data.shareExpiryTimers.values()) clearTimeout(timer);
      socket.data.shareExpiryTimers.clear();
      for (const boardId of socket.data.boards.keys()) {
        socket.to(roomName(boardId)).emit("board:presence:leave", { userId: socket.data.userId });
      }
    });
  });

  return io;
}
