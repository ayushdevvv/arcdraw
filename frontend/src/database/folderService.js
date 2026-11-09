import { db } from "./db.js";

function createId() {
  return globalThis.crypto?.randomUUID?.() || `folder-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function listFolders(guestId) {
  if (!guestId) return [];
  const folders = await db.folders.where("guestId").equals(guestId).toArray();
  return folders.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createFolder(guestId, name) {
  const cleanName = String(name || "").trim().slice(0, 64);
  if (!guestId) throw new Error("A local workspace is required.");
  if (!cleanName) throw new Error("Give this folder a name.");
  const existing = await db.folders.where("guestId").equals(guestId).filter((item) => item.name.toLowerCase() === cleanName.toLowerCase()).first();
  if (existing) throw new Error("A folder with that name already exists.");
  const now = new Date().toISOString();
  const folder = { id: createId(), guestId, name: cleanName, createdAt: now, updatedAt: now };
  await db.folders.add(folder);
  return folder;
}

export async function renameFolder(guestId, folderId, name) {
  const folder = await db.folders.get(folderId);
  if (!folder || folder.guestId !== guestId) throw new Error("Folder not found.");
  const cleanName = String(name || "").trim().slice(0, 64);
  if (!cleanName) throw new Error("Give this folder a name.");
  const collision = await db.folders.where("guestId").equals(guestId).filter((item) => item.id !== folderId && item.name.toLowerCase() === cleanName.toLowerCase()).first();
  if (collision) throw new Error("A folder with that name already exists.");
  await db.folders.update(folderId, { name: cleanName, updatedAt: new Date().toISOString() });
}

export async function deleteFolder(guestId, folderId) {
  const folder = await db.folders.get(folderId);
  if (!folder || folder.guestId !== guestId) return;
  await db.transaction("rw", db.folders, db.boards, async () => {
    const rooms = await db.boards.where("guestId").equals(guestId).filter((room) => room.folderId === folderId).toArray();
    for (const room of rooms) await db.boards.update(room.id, { folderId: null, updatedAt: new Date().toISOString() });
    await db.folders.delete(folderId);
  });
}

export async function moveRoomToFolder(guestId, roomId, folderId = null) {
  const room = await db.boards.get(roomId);
  if (!room || room.guestId !== guestId) throw new Error("Room not found.");
  if (folderId) {
    const folder = await db.folders.get(folderId);
    if (!folder || folder.guestId !== guestId) throw new Error("Folder not found.");
  }
  await db.boards.update(roomId, { folderId: folderId || null, updatedAt: new Date().toISOString() });
}
