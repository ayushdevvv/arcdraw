import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { listRoomNotes } from "./noteService.js";

export function useNotes(guestId, roomId) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!guestId || !roomId) {
      setNotes([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const subscription = liveQuery(() => listRoomNotes(guestId, roomId)).subscribe({
      next: (items) => { setNotes(items); setLoading(false); setError(""); },
      error: (cause) => { setError(cause?.message || "Could not load room notes."); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, [guestId, roomId]);

  return { notes, loading, error };
}
