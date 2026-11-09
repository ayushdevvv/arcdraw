import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { db } from "./db.js";

export function useBoards(guestId) {
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!guestId) {
      setBoards([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const subscription = liveQuery(async () => {
      const items = await db.boards.where("guestId").equals(guestId).toArray();
      return items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }).subscribe({
      next: (items) => {
        setBoards(items);
        setLoading(false);
        setError("");
      },
      error: (cause) => {
        setError(cause?.message || "Could not read your local rooms.");
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [guestId]);

  return { boards, loading, error };
}
