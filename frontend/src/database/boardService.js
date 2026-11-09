import { db } from "./db.js";

function cloneValue(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `board-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeDesignStudio(value = {}) {
  return {
    tokens: Array.isArray(value.tokens) ? value.tokens.slice(0, 100) : [],
    components: Array.isArray(value.components) ? value.components.slice(0, 100) : []
  };
}

function cleanAppState(appState = {}) {
  const zoom = typeof appState.zoom === "object" ? appState.zoom?.value : appState.zoom;

  return {
    viewBackgroundColor: appState.viewBackgroundColor || "#ffffff",
    currentItemStrokeColor: appState.currentItemStrokeColor || "#171715",
    currentItemBackgroundColor: appState.currentItemBackgroundColor || "transparent",
    currentItemFillStyle: appState.currentItemFillStyle || "solid",
    currentItemStrokeWidth: appState.currentItemStrokeWidth || 2,
    currentItemStrokeStyle: appState.currentItemStrokeStyle || "solid",
    currentItemRoughness: appState.currentItemRoughness ?? 0,
    currentItemRoundness: appState.currentItemRoundness || "round",
    currentItemOpacity: appState.currentItemOpacity ?? 100,
    currentItemFontFamily: appState.currentItemFontFamily ?? 6,
    currentItemFontSize: appState.currentItemFontSize,
    currentItemTextAlign: appState.currentItemTextAlign,
    currentItemStartArrowhead: appState.currentItemStartArrowhead,
    currentItemEndArrowhead: appState.currentItemEndArrowhead,
    gridSize: appState.gridSize ?? null,
    zoom: Number.isFinite(zoom) ? zoom : 1,
    scrollX: Number.isFinite(appState.scrollX) ? appState.scrollX : 0,
    scrollY: Number.isFinite(appState.scrollY) ? appState.scrollY : 0,
    theme: "light",
    viewModeEnabled: false
  };
}

export async function createBoard(guestId, title = "Untitled room", scene = {}) {
  if (!guestId) throw new Error("A guest session is required to create a local room.");

  const now = new Date().toISOString();
  const board = {
    id: createId(),
    guestId,
    title: title.trim() || "Untitled room",
    kind: scene.kind === "notes" ? "notes" : "board",
    folderId: scene.folderId || null,
    designStudio: normalizeDesignStudio(scene.designStudio),
    elements: Array.isArray(scene.elements) ? scene.elements : [],
    appState: cleanAppState(scene.appState || {}),
    files: scene.files || {},
    cloudId: scene.cloudId || null,
    shareToken: scene.shareToken || null,
    permission: scene.permission || null,
    starred: false,
    createdAt: now,
    updatedAt: now
  };

  const incomingNotes = Array.isArray(scene.notes) ? scene.notes : [];
  const noteRows = incomingNotes.filter((note) => note && typeof note === "object").map((note) => ({
    id: String(note.id || createId()),
    guestId,
    roomId: board.id,
    title: String(note.title || "Untitled note").trim().slice(0, 120) || "Untitled note",
    content: String(note.content || ""),
    linkedElementId: note.linkedElementId || null,
    createdAt: note.createdAt || now,
    updatedAt: note.updatedAt || now
  }));

  const projectRows = (Array.isArray(scene.projectItems) ? scene.projectItems : []).filter((item) => item && typeof item === "object").map((item) => ({
    ...item,
    id: String(item.id || createId()),
    guestId,
    roomId: board.id,
    kind: item.kind === "milestone" ? "milestone" : "task"
  }));

  await db.transaction("rw", db.boards, db.notes, db.projectItems, async () => {
    await db.boards.add(board);
    if (noteRows.length) await db.notes.bulkPut(noteRows);
    if (projectRows.length) await db.projectItems.bulkPut(projectRows);
  });
  return board;
}

export async function getBoard(guestId, boardId) {
  if (!guestId || !boardId) return null;
  return db.boards.get(boardId).then((board) => board?.guestId === guestId ? board : null);
}

export async function findBoardByCloudId(guestId, cloudId) {
  if (!guestId || !cloudId) return null;
  return db.boards.where("guestId").equals(guestId).filter((board) => board.cloudId === cloudId).first();
}

export async function setBoardCloudLink(guestId, boardId, cloudId, shareToken = null, permission = null) {
  const board = await getBoard(guestId, boardId);
  if (!board) throw new Error("Room not found.");
  await db.boards.update(boardId, {
    cloudId,
    shareToken: shareToken || null,
    permission: permission || board.permission || null,
    updatedAt: new Date().toISOString()
  });
}

export async function listBoards(guestId) {
  if (!guestId) return [];
  const boards = await db.boards.where("guestId").equals(guestId).toArray();
  return boards.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function renameBoard(guestId, boardId, title) {
  const board = await getBoard(guestId, boardId);
  if (!board) throw new Error("Room not found.");

  await db.boards.update(boardId, {
    title: title.trim() || "Untitled room",
    updatedAt: new Date().toISOString()
  });
}

export async function updateBoardScene(guestId, boardId, scene) {
  const board = await getBoard(guestId, boardId);
  if (!board) throw new Error("Room not found.");

  await db.boards.update(boardId, {
    elements: Array.isArray(scene.elements) ? scene.elements : board.elements,
    appState: cleanAppState(scene.appState || board.appState),
    files: scene.files || board.files || {},
    updatedAt: new Date().toISOString()
  });
}

export async function updateBoardDesignStudio(guestId, boardId, designStudio) {
  const board = await getBoard(guestId, boardId);
  if (!board) throw new Error("Room not found.");
  await db.boards.update(boardId, {
    designStudio: normalizeDesignStudio(designStudio),
    updatedAt: new Date().toISOString()
  });
}

export async function toggleBoardStar(guestId, boardId) {
  const board = await getBoard(guestId, boardId);
  if (!board) throw new Error("Room not found.");
  await db.boards.update(boardId, {
    starred: !board.starred,
    updatedAt: new Date().toISOString()
  });
}

export async function duplicateBoard(guestId, boardId) {
  const original = await getBoard(guestId, boardId);
  if (!original) throw new Error("Room not found.");

  const originalNotes = await db.notes.where("guestId").equals(guestId)
    .filter((note) => note.roomId === boardId).toArray();
  const originalProjectItems = await db.projectItems.where("guestId").equals(guestId)
    .filter((item) => item.roomId === boardId && !item.deletedAt).toArray();
  const noteIdMap = new Map(originalNotes.map((note) => [note.id, createId()]));
  const copiedNotes = originalNotes.map((note) => ({
    ...cloneValue(note),
    id: noteIdMap.get(note.id),
    roomId: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
  const projectIdMap = new Map(originalProjectItems.map((item) => [item.id, createId()]));
  const copiedProjectItems = originalProjectItems.map((item) => ({
    ...cloneValue(item),
    id: projectIdMap.get(item.id),
    linkedNoteId: item.linkedNoteId ? (noteIdMap.get(item.linkedNoteId) || null) : null,
    milestoneId: item.milestoneId ? (projectIdMap.get(item.milestoneId) || null) : null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));

  return createBoard(
    guestId,
    `${original.title} copy`,
    {
      elements: cloneValue(original.elements || []),
      appState: cloneValue(original.appState || {}),
      files: cloneValue(original.files || {}),
      notes: copiedNotes,
      projectItems: copiedProjectItems,
      kind: original.kind,
      folderId: original.folderId || null,
      designStudio: cloneValue(original.designStudio || { tokens: [], components: [] })
    }
  );
}

export async function deleteBoard(guestId, boardId) {
  const board = await getBoard(guestId, boardId);
  if (!board) return;
  await db.transaction("rw", db.boards, db.notes, db.projectItems, async () => {
    await db.boards.delete(boardId);
    await db.notes.where("guestId").equals(guestId)
      .filter((note) => note.roomId === boardId).delete();
    await db.projectItems.where("guestId").equals(guestId)
      .filter((item) => item.roomId === boardId).delete();
  });
}

export async function importBoardFile(guestId, file) {
  const raw = await file.text();
  const data = JSON.parse(raw);

  if (!data || !Array.isArray(data.elements)) {
    throw new Error("This file doesn't contain a valid Arcdraw or Excalidraw room.");
  }

  const title = file.name.replace(/\.(excalidraw|json)$/i, "") || "Imported room";
  const incomingNotes = Array.isArray(data.notes) ? data.notes : [];
  const incomingItems = Array.isArray(data.projectItems) ? data.projectItems.filter((item) => !item.deletedAt) : [];
  const noteIdMap = new Map(incomingNotes.map((note) => [note.id, createId()]));
  const projectIdMap = new Map(incomingItems.map((item) => [item.id, createId()]));
  return createBoard(guestId, title, {
    elements: data.elements,
    appState: data.appState || {},
    files: data.files || {},
    notes: incomingNotes.map((note) => ({
      ...note,
      id: noteIdMap.get(note.id),
      linkedElementId: note.linkedElementId || null
    })),
    projectItems: incomingItems.map((item) => ({
      ...item,
      id: projectIdMap.get(item.id),
      linkedNoteId: item.linkedNoteId ? (noteIdMap.get(item.linkedNoteId) || null) : null,
      milestoneId: item.milestoneId ? (projectIdMap.get(item.milestoneId) || null) : null,
      deletedAt: null
    })),
    kind: data.kind === "notes" ? "notes" : "board",
    designStudio: normalizeDesignStudio(data.designStudio)
  });
}

export function getExportPayload(board, liveScene = null, notes = [], projectItems = []) {
  const scene = liveScene || board;
  return {
    type: "excalidraw",
    version: 2,
    source: "arcdraw",
    elements: scene.elements || [],
    appState: {
      ...cleanAppState(scene.appState || {}),
      zoom: { value: Number(cleanAppState(scene.appState || {}).zoom) || 1 }
    },
    files: scene.files || {},
    kind: board.kind || "board",
    designStudio: normalizeDesignStudio(board.designStudio),
    projectItems: Array.isArray(projectItems) ? projectItems.filter((item) => !item.deletedAt).map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      description: item.description || "",
      status: item.status || "todo",
      priority: item.priority || "medium",
      assigneeId: item.assigneeId || null,
      assigneeName: item.assigneeName || null,
      dueDate: item.dueDate || null,
      milestoneId: item.milestoneId || null,
      linkedElementId: item.linkedElementId || null,
      linkedNoteId: item.linkedNoteId || null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    })) : [],
    notes: Array.isArray(notes) ? notes.map((note) => ({
      id: note.id,
      title: note.title,
      content: note.content,
      linkedElementId: note.linkedElementId || null,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt
    })) : []
  };
}
