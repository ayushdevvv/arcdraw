import { apiRequest } from "./apiClient.js";

export async function createCloudBoard({ title, kind = "board", sourceLocalId, scene, notes = [], projectItems = [] }) {
  const result = await apiRequest("/boards", {
    method: "POST",
    body: JSON.stringify({ title, kind, sourceLocalId, scene, notes, projectItems })
  });
  return result.data;
}

export async function createShareLink(boardId, { permission = "viewer", expiresInDays = null, shareToken = null } = {}) {
  const result = await apiRequest(`/boards/${encodeURIComponent(boardId)}/shares`, {
    method: "POST",
    body: JSON.stringify({ permission, expiresInDays, ...(shareToken ? { shareToken } : {}) })
  });
  return result.data;
}

export async function listShareLinks(boardId, shareToken = null) {
  const headers = shareToken ? { "X-Board-Share-Token": shareToken } : {};
  const result = await apiRequest(`/boards/${encodeURIComponent(boardId)}/shares`, { headers });
  return result.data.shares || [];
}

export async function revokeShareLink(boardId, shareId, shareToken = null) {
  return apiRequest(`/boards/${encodeURIComponent(boardId)}/shares/${encodeURIComponent(shareId)}`, {
    method: "DELETE",
    ...(shareToken ? { body: JSON.stringify({ shareToken }) } : {})
  });
}

export async function getSharedBoard(token) {
  const result = await apiRequest("/shares/resolve", {
    method: "POST",
    body: JSON.stringify({ token })
  });
  return result.data;
}

export async function requestWorkspaceJoin(token) {
  const result = await apiRequest("/shares/request-join", {
    method: "POST",
    body: JSON.stringify({ token })
  });
  return result.data;
}

export async function getBoardMembers(boardId) {
  const result = await apiRequest(`/boards/${encodeURIComponent(boardId)}/members`);
  return result.data;
}

export async function reviewWorkspaceJoinRequest(boardId, requestId, action) {
  const result = await apiRequest(
    `/boards/${encodeURIComponent(boardId)}/join-requests/${encodeURIComponent(requestId)}/${action}`,
    { method: "POST", body: JSON.stringify({}) }
  );
  return result.data;
}

export async function getCommitHistory(boardId, shareToken = null) {
  const headers = shareToken ? { "X-Board-Share-Token": shareToken } : {};
  const result = await apiRequest(`/boards/${encodeURIComponent(boardId)}/commits`, { headers });
  return result.data.commits || [];
}

export async function createBoardCommit(boardId, message, shareToken = null) {
  const result = await apiRequest(`/boards/${encodeURIComponent(boardId)}/commits`, {
    method: "POST",
    body: JSON.stringify({ message, ...(shareToken ? { shareToken } : {}) })
  });
  return result.data.commit;
}

export async function restoreBoardCommit(boardId, commitId, shareToken = null) {
  return apiRequest(`/boards/${encodeURIComponent(boardId)}/commits/${encodeURIComponent(commitId)}/restore`, {
    method: "POST",
    body: JSON.stringify(shareToken ? { shareToken } : {})
  });
}

export async function renameCloudBoard(boardId, title, shareToken = null) {
  const result = await apiRequest(`/boards/${encodeURIComponent(boardId)}`, {
    method: "PATCH",
    body: JSON.stringify({ title, ...(shareToken ? { shareToken } : {}) })
  });
  return result.data.board;
}

function shareHeaders(shareToken) {
  return shareToken ? { "X-Board-Share-Token": shareToken } : {};
}

// Owner only: choose how the room is edited. "live" or "commit".
export async function updateBoardSettings(boardId, { workMode }) {
  const result = await apiRequest(`/boards/${encodeURIComponent(boardId)}/settings`, {
    method: "PATCH",
    body: JSON.stringify({ workMode })
  });
  return result.data.board;
}

export async function listProposals(boardId, { shareToken = null, status = null } = {}) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const result = await apiRequest(`/boards/${encodeURIComponent(boardId)}/proposals${query}`, {
    headers: shareHeaders(shareToken)
  });
  return { proposals: result.data.proposals || [], pendingCount: result.data.pendingCount ?? null };
}

export async function getProposalPreview(boardId, proposalId, shareToken = null) {
  const result = await apiRequest(`/boards/${encodeURIComponent(boardId)}/proposals/${encodeURIComponent(proposalId)}/preview`, {
    headers: shareHeaders(shareToken)
  });
  return result.data.preview;
}

export async function acceptProposal(boardId, proposalId, shareToken = null) {
  const result = await apiRequest(`/boards/${encodeURIComponent(boardId)}/proposals/${encodeURIComponent(proposalId)}/accept`, {
    method: "POST",
    headers: shareHeaders(shareToken),
    body: JSON.stringify({})
  });
  return result.data.proposal;
}

export async function rejectProposal(boardId, proposalId, note = "", shareToken = null) {
  const result = await apiRequest(`/boards/${encodeURIComponent(boardId)}/proposals/${encodeURIComponent(proposalId)}/reject`, {
    method: "POST",
    headers: shareHeaders(shareToken),
    body: JSON.stringify({ note })
  });
  return result.data.proposal;
}

export async function withdrawProposal(boardId, proposalId, shareToken = null) {
  const result = await apiRequest(`/boards/${encodeURIComponent(boardId)}/proposals/${encodeURIComponent(proposalId)}/withdraw`, {
    method: "POST",
    headers: shareHeaders(shareToken),
    body: JSON.stringify({})
  });
  return result.data.proposal;
}
