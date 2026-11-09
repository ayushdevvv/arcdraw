import { useEffect, useRef } from "react";
import { toast } from "./toast/toastStore.js";
import { friendlyError } from "../utils/errors.js";

// Mounted once. Turns browser level events into clear, calm notifications:
// going offline, coming back online, app updates, and stray failures.
export default function AppSafety() {
  const wasOffline = useRef(!navigator.onLine);

  useEffect(function () {
    if (!navigator.onLine) {
      toast.warning("You are offline. Changes are saved on this device.", { id: "net-status", duration: null });
    }

    function handleOffline() {
      wasOffline.current = true;
      toast.warning("You are offline. Changes are saved on this device.", { id: "net-status", duration: null });
    }
    function handleOnline() {
      if (!wasOffline.current) return;
      wasOffline.current = false;
      toast.success("Back online.", { id: "net-status", duration: 2600 });
    }
    function handleOfflineReady() {
      toast.info("Arcdraw is ready to work offline.", { id: "offline-ready" });
    }
    function handleUpdateReady() {
      toast.info("A new version of Arcdraw is ready.", {
        id: "update-ready",
        duration: null,
        action: { label: "Reload", onClick: function () { window.location.reload(); } }
      });
    }
    function handleRejection(event) {
      const reason = event.reason;
      // Aborted requests and cancelled file pickers are normal, not failures.
      if (reason && (reason.name === "AbortError" || reason.name === "NotAllowedError")) return;
      console.error("Unhandled rejection:", reason);
      toast.error(friendlyError(reason), { id: "unhandled" });
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    window.addEventListener("arcdraw:offline-ready", handleOfflineReady);
    window.addEventListener("arcdraw:update-ready", handleUpdateReady);
    window.addEventListener("unhandledrejection", handleRejection);
    return function () {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("arcdraw:offline-ready", handleOfflineReady);
      window.removeEventListener("arcdraw:update-ready", handleUpdateReady);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
