import { db } from "./db.js";

function createId() {
  return globalThis.crypto?.randomUUID?.() || `note-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function listRoomNotes(guestId, roomId) {
  if (!guestId || !roomId) return [];
  const notes = await db.notes.where("guestId").equals(guestId).filter((note) => note.roomId === roomId).toArray();
  return notes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function createRoomNote(guestId, roomId, values = {}) {
  if (!guestId || !roomId) throw new Error("A local room is required to create a note.");
  const now = new Date().toISOString();
  const note = {
    id: createId(),
    guestId,
    roomId,
    title: String(values.title || "Untitled note").trim().slice(0, 120) || "Untitled note",
    content: String(values.content || ""),
    linkedElementId: values.linkedElementId || null,
    createdAt: now,
    updatedAt: now
  };
  await db.notes.add(note);
  return note;
}

export async function updateRoomNote(guestId, roomId, noteId, patch = {}) {
  const note = await db.notes.get(noteId);
  if (!note || note.guestId !== guestId || note.roomId !== roomId) throw new Error("Note not found in this room.");
  const update = {
    ...patch,
    ...(Object.hasOwn(patch, "title") ? { title: String(patch.title).trim().slice(0, 120) || "Untitled note" } : {}),
    ...(Object.hasOwn(patch, "content") ? { content: String(patch.content) } : {}),
    updatedAt: new Date().toISOString()
  };
  await db.notes.update(noteId, update);
  return { ...note, ...update };
}

export async function deleteRoomNote(guestId, roomId, noteId) {
  const note = await db.notes.get(noteId);
  if (!note || note.guestId !== guestId || note.roomId !== roomId) return;
  await db.notes.delete(noteId);
}

/** Replace a room's local replica after a merged Yjs update has arrived. */
export async function replaceRoomNotes(guestId, roomId, incomingNotes = []) {
  if (!guestId || !roomId) return;
  const safeNotes = incomingNotes.map((note) => ({
    id: String(note.id),
    guestId,
    roomId,
    title: String(note.title || "Untitled note").slice(0, 120),
    content: String(note.content || ""),
    linkedElementId: note.linkedElementId || null,
    createdAt: note.createdAt || new Date().toISOString(),
    updatedAt: note.updatedAt || new Date().toISOString()
  }));

  await db.transaction("rw", db.notes, async () => {
    const existing = await db.notes.where("guestId").equals(guestId).filter((note) => note.roomId === roomId).toArray();
    const incomingIds = new Set(safeNotes.map((note) => note.id));
    const toDelete = existing.filter((note) => !incomingIds.has(note.id)).map((note) => note.id);
    if (toDelete.length) await db.notes.bulkDelete(toDelete);
    if (safeNotes.length) await db.notes.bulkPut(safeNotes);
  });
}
