import { useEffect } from "react";
import { toast } from "./toast/toastStore.js";
import { friendlyError } from "../utils/errors.js";

// Mounted once. Turns stray failures into a clear, calm notification.
export default function AppSafety() {
  useEffect(function () {
    function handleRejection(event) {
      const reason = event.reason;
      // Aborted requests and cancelled file pickers are normal, not failures.
      if (reason && (reason.name === "AbortError" || reason.name === "NotAllowedError")) return;
      console.error("Unhandled rejection:", reason);
      toast.error(friendlyError(reason), { id: "unhandled" });
    }

    window.addEventListener("unhandledrejection", handleRejection);
    return function () {
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
