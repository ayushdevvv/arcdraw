import { createHash } from "node:crypto";
import * as Y from "yjs";
import BoardDocument from "../models/BoardDocument.model.js";
import BoardCommit from "../models/BoardCommit.model.js";
import Board from "../models/Board.model.js";
import { readSceneFromYDoc, writeSceneToYDoc } from "./yjs-scene.service.js";
import { ApiError } from "../utils/ApiError.js";

const rooms = new Map();
const pendingLoads = new Map();
const commitQueues = new Map();
const MAX_SNAPSHOT_BYTES = 7 * 1024 * 1024;

// Serialize checkpoint creation per board so two editors committing at the
// same time still receive a single, ordered parent chain on this single-node server.
async function withBoardCommitLock(boardId, task) {
  const key = String(boardId);
  const previous = commitQueues.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const tail = previous.then(() => gate);
  commitQueues.set(key, tail);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (commitQueues.get(key) === tail) commitQueues.delete(key);
  }
}

const VOLATILE_KEYS = new Set(["updated", "updatedAt", "version", "versionNonce"]);

// Key order and version counters differ between clients for identical content.
// Compare content only, so a copy that merely re-saved an element is not
// reported as an edit.
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      if (VOLATILE_KEYS.has(key)) continue;
      sorted[key] = canonicalize(value[key]);
    }
    return sorted;
  }
  return value;
}

function countChanges(beforeItems, afterItems, idSelector) {
  const before = new Map(beforeItems.map((item) => [idSelector(item), JSON.stringify(canonicalize(item))]));
  const after = new Map(afterItems.map((item) => [idSelector(item), JSON.stringify(canonicalize(item))]));
  let added = 0;
  let updated = 0;
  let deleted = 0;
  for (const [id, value] of after) {
    if (!before.has(id)) added += 1;
    else if (before.get(id) !== value) updated += 1;
  }
  for (const id of before.keys()) if (!after.has(id)) deleted += 1;
  return { added, updated, deleted };
}

export function summarizeSceneChange(beforeScene, afterScene) {
  // Excalidraw keeps deletion tombstones in the scene; count them as removed
  // rather than as ordinary element updates in the human-readable history.
  const beforeElements = (beforeScene?.elements || []).filter((item) => !item.isDeleted);
  const afterElements = (afterScene?.elements || []).filter((item) => !item.isDeleted);
  const elements = countChanges(beforeElements, afterElements, (item) => item.id);
  const files = countChanges(
    Object.entries(beforeScene?.files || {}).map(([id, value]) => ({ id, value })),
    Object.entries(afterScene?.files || {}).map(([id, value]) => ({ id, value })),
    (item) => item.id
  );
  const notes = countChanges(beforeScene?.notes || [], afterScene?.notes || [], (item) => item.id);
  const beforeProjectItems = (beforeScene?.projectItems || []).filter((item) => !item.deletedAt);
  const afterProjectItems = (afterScene?.projectItems || []).filter((item) => !item.deletedAt);
  const projectItems = countChanges(beforeProjectItems, afterProjectItems, (item) => item.id);
  const discussionChanges = (key) => countChanges(beforeScene?.[key] || [], afterScene?.[key] || [], (item) => item.id);
  const messages = discussionChanges("messages");
  const comments = discussionChanges("comments");
  const designStudio = countChanges(
    [...(beforeScene?.designStudio?.tokens || []), ...(beforeScene?.designStudio?.components || [])],
    [...(afterScene?.designStudio?.tokens || []), ...(afterScene?.designStudio?.components || [])],
    (item) => item.id
  );
  return {
    elementsAdded: elements.added,
    elementsUpdated: elements.updated,
    elementsDeleted: elements.deleted,
    filesAdded: files.added,
    filesUpdated: files.updated,
    filesDeleted: files.deleted,
    notesAdded: notes.added,
    notesUpdated: notes.updated,
    notesDeleted: notes.deleted,
    projectItemsAdded: projectItems.added,
    projectItemsUpdated: projectItems.updated,
    projectItemsDeleted: projectItems.deleted,
    messagesAdded: messages.added,
    messagesUpdated: messages.updated,
    messagesDeleted: messages.deleted,
    commentsAdded: comments.added,
    commentsUpdated: comments.updated,
    commentsDeleted: comments.deleted,
    designStudioAdded: designStudio.added,
    designStudioUpdated: designStudio.updated,
    designStudioDeleted: designStudio.deleted
  };
}

async function persistRoom(boardId, room) {
  const snapshot = Buffer.from(Y.encodeStateAsUpdate(room.doc));
  if (snapshot.byteLength > MAX_SNAPSHOT_BYTES) {
    throw new ApiError(413, "This room reached the 7 MB sync limit. Remove large images or content before editing further.", "SNAPSHOT_TOO_LARGE");
  }

  // Serialize writes so a slower earlier MongoDB update cannot land after a
  // newer snapshot. The returned promise resolves only after MongoDB confirms
  // the durable snapshot write.
  const write = room.persistChain.catch(() => {}).then(() => BoardDocument.updateOne(
    { board: boardId },
    { $set: { snapshot, byteLength: snapshot.byteLength, updatedAt: new Date() } },
    { upsert: true }
  ));
  room.persistChain = write;
  await write;
  room.lastPersistedAt = new Date();
  return room.lastPersistedAt;
}

function schedulePersist(boardId, room) {
  clearTimeout(room.persistTimer);
  const promise = new Promise((resolve, reject) => {
    room.persistWaiters.push({ resolve, reject });
  });

  room.persistTimer = setTimeout(async () => {
    room.persistTimer = null;
    const waiters = room.persistWaiters.splice(0);
    try {
      const persistedAt = await persistRoom(boardId, room);
      for (const waiter of waiters) waiter.resolve(persistedAt);
    } catch (error) {
      for (const waiter of waiters) waiter.reject(error);
      console.error(`[collab] Snapshot persistence failed for ${boardId}:`, error.message);
    }
  }, 700);
  room.persistTimer.unref?.();
  return promise;
}

async function persistNow(boardId, room) {
  clearTimeout(room.persistTimer);
  room.persistTimer = null;
  const waiters = room.persistWaiters.splice(0);
  try {
    const persistedAt = await persistRoom(boardId, room);
    for (const waiter of waiters) waiter.resolve(persistedAt);
    return persistedAt;
  } catch (error) {
    for (const waiter of waiters) waiter.reject(error);
    throw error;
  }
}

export async function getRoomDocument(boardId) {
  const id = String(boardId);
  if (rooms.has(id)) return rooms.get(id).doc;
  if (pendingLoads.has(id)) return pendingLoads.get(id);

  const loading = (async () => {
    const doc = new Y.Doc();
    const record = await BoardDocument.findOne({ board: id }).lean();
    if (record?.snapshot?.length) {
      Y.applyUpdate(doc, new Uint8Array(record.snapshot.buffer, record.snapshot.byteOffset, record.snapshot.byteLength));
    }
    const room = {
      doc,
      persistTimer: null,
      persistChain: Promise.resolve(),
      persistWaiters: [],
      lastPersistedAt: null
    };
    doc.on("update", () => {
      void schedulePersist(id, room).catch((error) => {
        console.error(`[collab] Scheduled snapshot persistence failed for ${id}:`, error.message);
      });
    });
    rooms.set(id, room);
    return doc;
  })().finally(() => pendingLoads.delete(id));

  pendingLoads.set(id, loading);
  return loading;
}

export async function createBoardDocument(boardId, scene) {
  const doc = await getRoomDocument(boardId);
  writeSceneToYDoc(doc, scene, "arcdraw-initial-seed");
  const snapshot = Y.encodeStateAsUpdate(doc);
  if (snapshot.byteLength > MAX_SNAPSHOT_BYTES) {
    throw new ApiError(413, "This board is too large to sync (7 MB maximum).", "SNAPSHOT_TOO_LARGE");
  }
  const room = rooms.get(String(boardId));
  if (room) await persistNow(String(boardId), room);
  return doc;
}

export async function applyDocumentUpdate(boardId, updateBuffer) {
  if (!Buffer.isBuffer(updateBuffer) || updateBuffer.byteLength > MAX_SNAPSHOT_BYTES) {
    throw new ApiError(413, "Collaboration update is too large (7 MB maximum).", "UPDATE_TOO_LARGE");
  }
  const doc = await getRoomDocument(boardId);
  const update = new Uint8Array(updateBuffer);
  const currentSize = Y.encodeStateAsUpdate(doc).byteLength;

  // Normal small updates take the fast path. Near the storage limit, validate
  // the merged snapshot on a temporary document before mutating the live room.
  if (currentSize + update.byteLength > MAX_SNAPSHOT_BYTES) {
    const candidate = new Y.Doc();
    Y.applyUpdate(candidate, Y.encodeStateAsUpdate(doc));
    Y.applyUpdate(candidate, update);
    const candidateSize = Y.encodeStateAsUpdate(candidate).byteLength;
    candidate.destroy();
    if (candidateSize > MAX_SNAPSHOT_BYTES) {
      throw new ApiError(413, "This board reached its 7 MB sync limit. Remove large images or content before editing further.", "SNAPSHOT_TOO_LARGE");
    }
  }

  Y.applyUpdate(doc, update, "arcdraw-socket-update");
  const room = rooms.get(String(boardId));
  if (room) await schedulePersist(String(boardId), room);
  return doc;
}

export async function getDocumentSnapshot(boardId) {
  const doc = await getRoomDocument(boardId);
  return Buffer.from(Y.encodeStateAsUpdate(doc));
}

export async function getDocumentScene(boardId) {
  const doc = await getRoomDocument(boardId);
  return readSceneFromYDoc(doc);
}

export async function flushDocument(boardId) {
  const doc = await getRoomDocument(boardId);
  const snapshot = Buffer.from(Y.encodeStateAsUpdate(doc));
  if (snapshot.byteLength > MAX_SNAPSHOT_BYTES) {
    throw new ApiError(413, "This board exceeds the 7 MB sync limit.", "SNAPSHOT_TOO_LARGE");
  }
  const room = rooms.get(String(boardId));
  if (room) await persistNow(String(boardId), room);
  return snapshot;
}

export async function createBoardCommit({ boardId, authorId, message, kind = "commit", mergedBy = null }) {
  return withBoardCommitLock(boardId, async () => {
    const snapshot = await flushDocument(boardId);
    if (snapshot.byteLength > MAX_SNAPSHOT_BYTES) {
      throw new ApiError(413, "This board is too large to checkpoint (7 MB maximum).", "SNAPSHOT_TOO_LARGE");
    }
    const parent = await BoardCommit.findOne({ board: boardId })
      .sort({ sequence: -1, createdAt: -1 })
      .select("_id sequence shortHash +snapshot")
      .lean();
    const sequence = (parent?.sequence || 0) + 1;

    let beforeScene = { elements: [], files: {} };
    if (parent?.snapshot?.length) {
      const previousDoc = new Y.Doc();
      Y.applyUpdate(previousDoc, new Uint8Array(parent.snapshot.buffer, parent.snapshot.byteOffset, parent.snapshot.byteLength));
      beforeScene = readSceneFromYDoc(previousDoc);
      previousDoc.destroy();
    }
    const currentDoc = await getRoomDocument(boardId);
    const afterScene = readSceneFromYDoc(currentDoc);
    const changeSummary = summarizeSceneChange(beforeScene, afterScene);

    const shortHash = createHash("sha256")
      .update(snapshot)
      .update(parent?.shortHash || "root")
      .update(message.trim())
      .update(String(sequence))
      .digest("hex")
      .slice(0, 7);

    const commit = await BoardCommit.create({
      board: boardId,
      author: authorId,
      parent: parent?._id || null,
      sequence,
      message: message.trim(),
      shortHash,
      snapshot,
      byteLength: snapshot.byteLength,
      changeSummary,
      mergedBy,
      kind
    });
    await Board.updateOne({ _id: boardId }, { $set: { lastCommitAt: commit.createdAt } });
    return commit;
  });
}

export async function listBoardCommits(boardId, limit = 50) {
  const commits = await BoardCommit.find({ board: boardId })
    .sort({ sequence: -1, createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .populate("author", "name email avatarUrl")
    .populate("mergedBy", "name")
    .populate("parent", "shortHash sequence")
    .select("message shortHash kind byteLength createdAt author mergedBy parent sequence changeSummary")
    .lean();
  return commits.map((commit) => ({
    id: String(commit._id),
    sequence: commit.sequence || 1,
    parent: commit.parent ? { shortHash: commit.parent.shortHash, sequence: commit.parent.sequence } : null,
    message: commit.message,
    shortHash: commit.shortHash,
    kind: commit.kind,
    byteLength: commit.byteLength,
    changeSummary: commit.changeSummary || {},
    createdAt: commit.createdAt,
    mergedBy: commit.mergedBy ? { id: String(commit.mergedBy._id), name: commit.mergedBy.name } : null,
    author: commit.author ? {
      id: String(commit.author._id), name: commit.author.name, avatarUrl: commit.author.avatarUrl || null
    } : null
  }));
}

export async function restoreBoardCommit({ boardId, commitId, authorId }) {
  const commit = await BoardCommit.findOne({ _id: commitId, board: boardId }).select("+snapshot");
  if (!commit) throw new ApiError(404, "Commit not found.", "COMMIT_NOT_FOUND");

  const restoredDoc = new Y.Doc();
  Y.applyUpdate(restoredDoc, new Uint8Array(commit.snapshot.buffer, commit.snapshot.byteOffset, commit.snapshot.byteLength));
  const scene = readSceneFromYDoc(restoredDoc);
  restoredDoc.destroy();

  const liveDoc = await getRoomDocument(boardId);
  let emittedUpdate = null;
  const capture = (update, origin) => {
    if (origin === "arcdraw-restore") emittedUpdate = Buffer.from(update);
  };
  liveDoc.on("update", capture);
  writeSceneToYDoc(liveDoc, scene, "arcdraw-restore");
  liveDoc.off("update", capture);

  const room = rooms.get(String(boardId));
  if (room) await flushDocument(boardId);

  const restoreCommit = await createBoardCommit({
    boardId,
    authorId,
    message: `Restore ${commit.shortHash}`,
    kind: "restore"
  });

  return { commit: restoreCommit, update: emittedUpdate };
}

export async function shutdownCollaboration() {
  for (const [boardId, room] of rooms.entries()) {
    await persistNow(boardId, room);
    room.doc.destroy();
  }
  rooms.clear();
}
