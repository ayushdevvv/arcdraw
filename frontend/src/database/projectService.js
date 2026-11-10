import { db } from "./db.js";

function createId() {
  return globalThis.crypto?.randomUUID?.() || `project-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function listRoomProjectItems(guestId, roomId) {
  if (!guestId || !roomId) return [];
  const items = await db.projectItems.where("guestId").equals(guestId)
    .filter((item) => item.roomId === roomId).toArray();
  return items.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

export async function saveRoomProjectItem(guestId, roomId, values = {}) {
  if (!guestId || !roomId) throw new Error("A room is required to save project work.");
  const now = new Date().toISOString();
  const existing = values.id ? await db.projectItems.get(values.id) : null;
  if (existing?.deletedAt) throw new Error("This project item was deleted in another update.");
  const item = {
    ...(existing || {}),
    ...values,
    id: String(values.id || createId()),
    guestId,
    roomId,
    kind: values.kind === "milestone" ? "milestone" : "task",
    title: String(values.title || "Untitled task").trim().slice(0, 120) || "Untitled task",
    description: String(values.description || "").slice(0, 3000),
    updatedAt: now,
    createdAt: existing?.createdAt || values.createdAt || now,
    deletedAt: null
  };
  await db.projectItems.put(item);
  return listRoomProjectItems(guestId, roomId);
}

export async function deleteRoomProjectItem(guestId, roomId, itemId) {
  const item = await db.projectItems.get(itemId);
  let tombstone = null;
  const changedItems = [];
  if (item && item.guestId === guestId && item.roomId === roomId) {
    const now = new Date().toISOString();
    await db.transaction("rw", db.projectItems, async () => {
      const roomTasks = await db.projectItems.where("guestId").equals(guestId)
        .filter((entry) => entry.roomId === roomId && entry.kind === "task" && !entry.deletedAt).toArray();
      if (item.kind === "milestone") {
        const linkedTasks = roomTasks.filter((entry) => entry.milestoneId === itemId);
        for (const task of linkedTasks) {
          const updated = { ...task, milestoneId: null, updatedAt: now };
          await db.projectItems.update(task.id, { milestoneId: null, updatedAt: now });
          changedItems.push(updated);
        }
      } else {
        for (const task of roomTasks) {
          const patch = {};
          if (task.parentTaskId === itemId) patch.parentTaskId = null;
          if (task.dependsOnIds?.includes(itemId)) patch.dependsOnIds = task.dependsOnIds.filter((id) => id !== itemId);
          if (Object.keys(patch).length) {
            const updated = { ...task, ...patch, updatedAt: now };
            await db.projectItems.update(task.id, { ...patch, updatedAt: now });
            changedItems.push(updated);
          }
        }
      }
      // Keep a tombstone in both IndexedDB and Yjs. This prevents an offline
      // collaborator's stale copy from resurrecting a deleted task or milestone.
      tombstone = { ...item, deletedAt: now, updatedAt: now };
      await db.projectItems.put(tombstone);
    });
  }
  return { items: await listRoomProjectItems(guestId, roomId), tombstone, changedItems };
}

export async function mergeRoomProjectItems(guestId, roomId, incoming = []) {
  if (!guestId || !roomId || !Array.isArray(incoming)) return listRoomProjectItems(guestId, roomId);
  const incomingItems = incoming.filter((item) => item && item.id);
  const existingItems = await db.projectItems.bulkGet(incomingItems.map((item) => String(item.id)));
  const safeItems = incomingItems.map((item, index) => ({
    ...item,
    id: String(item.id),
    guestId,
    roomId,
    kind: item.kind === "milestone" ? "milestone" : "task",
    title: String(item.title || "Untitled task").slice(0, 120),
    description: String(item.description || "").slice(0, 3000),
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString(),
    // Preserve a local deletion tombstone when a legacy/stale replica omits
    // the field. An explicit null is sent only by an authoritative history
    // restore and is allowed to reactivate the item.
    deletedAt: Object.prototype.hasOwnProperty.call(item, "deletedAt")
      ? (item.deletedAt || null)
      : (existingItems[index]?.deletedAt || null)
  }));
  // Merge by stable ID; never delete records simply because one replica has
  // not received them yet. Explicit tombstones carry deletions across clients.
  if (safeItems.length) await db.projectItems.bulkPut(safeItems);
  return listRoomProjectItems(guestId, roomId);
}

export function visibleProjectItems(items = []) {
  return items.filter((item) => !item.deletedAt);
}
