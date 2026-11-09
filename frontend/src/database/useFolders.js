import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { db } from "./db.js";

export function useFolders(guestId) {
  const [folders, setFolders] = useState([]);
  useEffect(() => {
    if (!guestId) { setFolders([]); return undefined; }
    const subscription = liveQuery(() => db.folders.where("guestId").equals(guestId).toArray()).subscribe({
      next: (items) => setFolders(items.sort((a, b) => a.name.localeCompare(b.name))),
      error: (error) => console.error("Folder library read failed:", error)
    });
    return () => subscription.unsubscribe();
  }, [guestId]);
  return folders;
}
