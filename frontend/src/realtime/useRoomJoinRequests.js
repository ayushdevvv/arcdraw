import { useCallback, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { SOCKET_URL } from "../services/apiClient.js";
import { getSocketTicket } from "../services/authService.js";
import { listOwnedJoinRequests, resolveJoinRequest } from "../services/boardCloudService.js";
import { toast } from "../components/toast/toastStore.js";

export function useRoomJoinRequests(user) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resolvingId, setResolvingId] = useState("");

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setRequests([]);
      return [];
    }
    setLoading(true);
    try {
      const nextRequests = await listOwnedJoinRequests();
      setRequests(nextRequests);
      setError("");
      return nextRequests;
    } catch (cause) {
      setError(cause?.message || "Could not load room requests.");
      return [];
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setRequests([]);
      setError("");
      return undefined;
    }

    let active = true;
    let socket = null;

    void refresh();

    async function connectInbox() {
      try {
        const ticket = await getSocketTicket();
        if (!active || !ticket?.socketToken) return;
        socket = io(SOCKET_URL, {
          withCredentials: false,
          auth: { socketToken: ticket.socketToken },
          transports: ["polling", "websocket"],
          tryAllTransports: true,
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 900,
          reconnectionDelayMax: 6000
        });

        let renewingTicket = false;
        socket.on("connect", () => { void refresh(); });
        socket.on("connect_error", async (socketError) => {
          if (renewingTicket || !/sign in|credential|session/i.test(socketError?.message || "")) return;
          renewingTicket = true;
          try {
            const renewed = await getSocketTicket();
            if (active && renewed?.socketToken) {
              socket.auth = { socketToken: renewed.socketToken };
              socket.connect();
            }
          } catch {
            // The HTTP inbox remains available; a fresh app session can restore live alerts.
          } finally {
            renewingTicket = false;
          }
        });
        socket.on("room:join-request", (request) => {
          if (!request?.id || !request?.board?.id) return;
          setRequests((current) => {
            const next = [request, ...current.filter((item) => item.id !== request.id)];
            return next.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
          });
          const requester = request.user?.name || request.user?.email || "Someone";
          toast.info(`${requester} requested to join ${request.board.title || "your room"}.`);
        });
        socket.on("room:join-request:resolved", (result) => {
          if (!result?.requestId) return;
          setRequests((current) => current.filter((item) => item.id !== result.requestId));
        });
      } catch (cause) {
        if (active) setError(cause?.message || "Room request notifications are unavailable.");
      }
    }

    void connectInbox();
    return () => {
      active = false;
      socket?.removeAllListeners();
      socket?.disconnect();
    };
  }, [user?.id, refresh]);

  const resolve = useCallback(async (request, decision) => {
    if (!request?.id || !request?.board?.id || resolvingId) return false;
    setResolvingId(request.id);
    try {
      await resolveJoinRequest(request.board.id, request.id, decision);
      setRequests((current) => current.filter((item) => item.id !== request.id));
      toast.success(decision === "approved" ? `${request.user?.name || "Teammate"} can now edit ${request.board.title}.` : "Join request declined.");
      return true;
    } catch (cause) {
      toast.error(cause?.message || "Could not update this request.");
      return false;
    } finally {
      setResolvingId("");
    }
  }, [resolvingId]);

  return { requests, loading, error, resolvingId, refresh, resolve };
}
