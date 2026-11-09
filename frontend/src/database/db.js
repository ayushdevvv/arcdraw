import Dexie from "dexie";

class ArcdrawDatabase extends Dexie {
  constructor() {
    super("arcdraw-local");

    this.version(1).stores({
      boards: "id, guestId, title, createdAt, updatedAt, starred"
    });

    this.version(2).stores({
      boards: "id, guestId, cloudId, title, createdAt, updatedAt, starred"
    }).upgrade(async (transaction) => {
      await transaction.table("boards").toCollection().modify((board) => {
        board.cloudId ||= null;
        board.shareToken ||= null;
      });
    });

    this.version(3).stores({
      boards: "id, guestId, cloudId, title, createdAt, updatedAt, starred",
      notes: "id, guestId, roomId, title, createdAt, updatedAt, linkedElementId"
    });

    this.version(4).stores({
      boards: "id, guestId, cloudId, title, kind, createdAt, updatedAt, starred",
      notes: "id, guestId, roomId, title, createdAt, updatedAt, linkedElementId",
      projectItems: "id, guestId, roomId, kind, status, updatedAt, deletedAt, linkedElementId, linkedNoteId"
    }).upgrade(async (transaction) => {
      await transaction.table("boards").toCollection().modify((board) => {
        board.kind ||= "board";
      });
    });

    this.version(5).stores({
      boards: "id, guestId, cloudId, folderId, title, kind, createdAt, updatedAt, starred",
      notes: "id, guestId, roomId, title, createdAt, updatedAt, linkedElementId",
      projectItems: "id, guestId, roomId, kind, status, updatedAt, deletedAt, linkedElementId, linkedNoteId",
      folders: "id, guestId, name, createdAt, updatedAt"
    }).upgrade(async (transaction) => {
      await transaction.table("boards").toCollection().modify((board) => {
        board.folderId ||= null;
      });
    });
  }
}

export const db = new ArcdrawDatabase();
