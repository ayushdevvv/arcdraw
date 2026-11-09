import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { db } from "./db.js";

export function useRoomNoteCounts(guestId) {
  const [counts, setCounts] = useState({});

  useEffect(() => {
    if (!guestId) {
      setCounts({});
      return undefined;
    }

    const subscription = liveQuery(async () => {
      const notes = await db.notes.where("guestId").equals(guestId).toArray();
      return notes.reduce((result, note) => {
        result[note.roomId] = (result[note.roomId] || 0) + 1;
        return result;
      }, {});
    }).subscribe({
      next: setCounts,
      error: (error) => console.error("Room note counts unavailable:", error)
    });

    return () => subscription.unsubscribe();
  }, [guestId]);

  return counts;
}
