import * as Y from "yjs";
import mongoose from "mongoose";
import BoardProposal from "../models/BoardProposal.model.js";
import {
  getRoomDocument,
  applyDocumentUpdate,
  createBoardCommit,
  summarizeSceneChange
} from "./collaboration.service.js";
import { readSceneFromYDoc } from "./yjs-scene.service.js";
import { ApiError } from "../utils/ApiError.js";

const MAX_PROPOSAL_BYTES = 7 * 1024 * 1024;

function hasAnyChange(summary) {
  return Object.values(summary).some((value) => Number(value) > 0);
}

/**
 * Pure helper. Given the live room document and an update from an editor's
 * private draft, work out what that draft would change in the room.
 * Nothing is applied to the live document.
 */
export function evaluateProposalUpdate(mainDoc, incomingUpdate) {
  const mainState = Y.encodeStateAsUpdate(mainDoc);
  const diff = Y.diffUpdate(incomingUpdate, Y.encodeStateVector(mainDoc));

  const candidate = new Y.Doc();
  try {
    Y.applyUpdate(candidate, mainState);
    const before = readSceneFromYDoc(candidate);
    Y.applyUpdate(candidate, diff);
    const after = readSceneFromYDoc(candidate);
    return { diff, before, after, summary: summarizeSceneChange(before, after) };
  } finally {
    candidate.destroy();
  }
}

export function proposalDto(proposal) {
  const author = proposal.author && proposal.author._id ? proposal.author : null;
  const resolver = proposal.resolvedBy && proposal.resolvedBy._id ? proposal.resolvedBy : null;
  return {
    id: String(proposal._id),
    boardId: String(proposal.board),
    message: proposal.message,
    status: proposal.status,
    summary: proposal.summary || {},
    byteLength: proposal.byteLength || 0,
    note: proposal.note || "",
    createdAt: proposal.createdAt,
    resolvedAt: proposal.resolvedAt || null,
    author: author
      ? { id: String(author._id), name: author.name, avatarUrl: author.avatarUrl || null }
      : { id: String(proposal.author), name: "Member", avatarUrl: null },
    resolvedBy: resolver ? { id: String(resolver._id), name: resolver.name } : null
  };
}

async function loadProposalDto(proposalId) {
  const populated = await BoardProposal.findById(proposalId)
    .populate("author", "name avatarUrl")
    .populate("resolvedBy", "name")
    .lean();
  return populated ? proposalDto(populated) : null;
}

export async function createProposal({ boardId, authorId, message, update }) {
  const alreadyPending = await BoardProposal.exists({ board: boardId, author: authorId, status: "pending" });
  if (alreadyPending) {
    throw new ApiError(
      409,
      "You already have a request waiting for review. Withdraw it or wait for the owner.",
      "PROPOSAL_ALREADY_PENDING"
    );
  }

  const mainDoc = await getRoomDocument(boardId);
  const { diff, summary } = evaluateProposalUpdate(mainDoc, update);
  if (!hasAnyChange(summary)) {
    throw new ApiError(400, "There are no new changes to submit.", "NO_CHANGES");
  }
  if (diff.byteLength > MAX_PROPOSAL_BYTES) {
    throw new ApiError(413, "These changes are too large to submit (7 MB maximum).", "PROPOSAL_TOO_LARGE");
  }

  const proposal = await BoardProposal.create({
    board: boardId,
    author: authorId,
    message,
    update: Buffer.from(diff),
    byteLength: diff.byteLength,
    summary
  });
  return loadProposalDto(proposal._id);
}

export async function listProposals({ boardId, authorId = null, status = null, limit = 50 }) {
  const filter = { board: boardId };
  if (authorId) filter.author = authorId;
  if (status) filter.status = status;
  const proposals = await BoardProposal.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .populate("author", "name avatarUrl")
    .populate("resolvedBy", "name")
    .lean();
  return proposals.map(proposalDto);
}

export async function countPendingProposals(boardId) {
  return BoardProposal.countDocuments({ board: boardId, status: "pending" });
}

async function getPendingProposalWithUpdate(boardId, proposalId) {
  if (!mongoose.isValidObjectId(proposalId)) {
    throw new ApiError(400, "Invalid request ID.", "PROPOSAL_ID_INVALID");
  }
  const proposal = await BoardProposal.findOne({ _id: proposalId, board: boardId }).select("+update");
  if (!proposal) throw new ApiError(404, "That request was not found.", "PROPOSAL_NOT_FOUND");
  if (proposal.status !== "pending") {
    throw new ApiError(409, `This request was already ${proposal.status}.`, "PROPOSAL_NOT_PENDING");
  }
  return proposal;
}

export async function previewProposal({ boardId, proposalId }) {
  const proposal = await getPendingProposalWithUpdate(boardId, proposalId);
  const mainDoc = await getRoomDocument(boardId);
  const { before, after } = evaluateProposalUpdate(mainDoc, new Uint8Array(proposal.update));

  const visible = (elements) => elements.filter((element) => !element.isDeleted);
  const beforeElements = visible(before.elements);
  const afterElements = visible(after.elements);
  const beforeById = new Map(beforeElements.map((element) => [element.id, JSON.stringify(element)]));
  const afterById = new Map(afterElements.map((element) => [element.id, JSON.stringify(element)]));

  const changed = { added: [], updated: [], deleted: [] };
  for (const [id, value] of afterById) {
    if (!beforeById.has(id)) changed.added.push(id);
    else if (beforeById.get(id) !== value) changed.updated.push(id);
  }
  for (const id of beforeById.keys()) if (!afterById.has(id)) changed.deleted.push(id);

  const fileIds = new Set();
  for (const element of [...beforeElements, ...afterElements]) {
    if (element.type === "image" && element.fileId) fileIds.add(element.fileId);
  }
  const files = {};
  for (const id of fileIds) {
    const file = after.files[id] || before.files[id];
    if (file) files[id] = file;
  }

  return {
    before: { elements: beforeElements, appState: before.appState },
    after: { elements: afterElements, appState: after.appState },
    files,
    changed
  };
}

/**
 * Merge a pending request into the live room.
 * The request is claimed first so two owners (or two tabs) cannot merge it twice.
 */
export async function acceptProposal({ boardId, proposalId, ownerId }) {
  const proposal = await getPendingProposalWithUpdate(boardId, proposalId);
  const claimed = await BoardProposal.findOneAndUpdate(
    { _id: proposal._id, status: "pending" },
    { $set: { status: "accepted", resolvedBy: ownerId, resolvedAt: new Date() } }
  );
  if (!claimed) throw new ApiError(409, "This request was already handled.", "PROPOSAL_NOT_PENDING");

  const update = Buffer.from(proposal.update);
  try {
    await applyDocumentUpdate(boardId, update);
  } catch (error) {
    await BoardProposal.updateOne(
      { _id: proposal._id },
      { $set: { status: "pending", resolvedBy: null, resolvedAt: null } }
    );
    throw error;
  }

  let commitId = null;
  try {
    const commit = await createBoardCommit({
      boardId,
      authorId: proposal.author,
      message: proposal.message,
      kind: "merge",
      mergedBy: ownerId
    });
    commitId = commit._id;
    await BoardProposal.updateOne({ _id: proposal._id }, { $set: { commit: commit._id } });
  } catch (error) {
    // The merge itself succeeded. A missing history entry should not undo it.
    console.error(`[proposal] Merged ${proposal._id} but could not record a commit:`, error.message);
  }

  return { update, commitId, proposal: await loadProposalDto(proposal._id), authorId: String(proposal.author) };
}

export async function rejectProposal({ boardId, proposalId, ownerId, note = "" }) {
  const proposal = await getPendingProposalWithUpdate(boardId, proposalId);
  const claimed = await BoardProposal.findOneAndUpdate(
    { _id: proposal._id, status: "pending" },
    { $set: { status: "rejected", resolvedBy: ownerId, resolvedAt: new Date(), note: String(note || "").slice(0, 280) } }
  );
  if (!claimed) throw new ApiError(409, "This request was already handled.", "PROPOSAL_NOT_PENDING");
  return { proposal: await loadProposalDto(proposal._id), authorId: String(proposal.author) };
}

export async function withdrawProposal({ boardId, proposalId, authorId }) {
  if (!mongoose.isValidObjectId(proposalId)) {
    throw new ApiError(400, "Invalid request ID.", "PROPOSAL_ID_INVALID");
  }
  const claimed = await BoardProposal.findOneAndUpdate(
    { _id: proposalId, board: boardId, author: authorId, status: "pending" },
    { $set: { status: "withdrawn", resolvedAt: new Date() } }
  );
  if (!claimed) throw new ApiError(404, "No pending request to withdraw.", "PROPOSAL_NOT_FOUND");
  return { proposal: await loadProposalDto(claimed._id) };
}
