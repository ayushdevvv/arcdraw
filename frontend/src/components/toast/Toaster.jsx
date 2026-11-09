import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { subscribe, getToasts, dismissToast } from "./toastStore.js";
import "./toast.css";

function iconFor(type) {
  if (type === "success") return <CircleCheck size={18} strokeWidth={2} />;
  if (type === "error") return <CircleAlert size={18} strokeWidth={2} />;
  if (type === "warning") return <TriangleAlert size={18} strokeWidth={2} />;
  if (type === "loading") return <LoaderCircle size={18} strokeWidth={2} className="arc-toast-spin" />;
  return <Info size={18} strokeWidth={2} />;
}

function ToastItem({ item, paused }) {
  const remaining = useRef(item.duration);
  const startedAt = useRef(0);

  // A repeated message (new stamp) or a changed duration restarts the clock.
  useEffect(function () {
    remaining.current = item.duration;
  }, [item.stamp, item.duration]);

  useEffect(function () {
    if (item.duration === null || paused) return undefined;
    startedAt.current = Date.now();
    const timer = window.setTimeout(function () { dismissToast(item.key); }, remaining.current);
    return function () {
      window.clearTimeout(timer);
      remaining.current = Math.max(600, remaining.current - (Date.now() - startedAt.current));
    };
  }, [item.key, item.stamp, item.duration, paused]);

  function handleDismiss() { dismissToast(item.key); }
  function handleAction() {
    try { item.action.onClick(); } finally { dismissToast(item.key); }
  }

  return (
    <div className={"arc-toast arc-toast-" + item.type} role={item.type === "error" ? "alert" : "status"}>
      <span className="arc-toast-icon">{iconFor(item.type)}</span>
      <div className="arc-toast-body">
        <p className="arc-toast-message">{item.message}{item.count > 1 && <b className="arc-toast-count">{item.count}</b>}</p>
        {item.description && <p className="arc-toast-description">{item.description}</p>}
      </div>
      {item.action && <button className="arc-toast-action" type="button" onClick={handleAction}>{item.action.label}</button>}
      <button className="arc-toast-close" type="button" onClick={handleDismiss} aria-label="Dismiss notification"><X size={15} /></button>
    </div>
  );
}

export default function Toaster() {
  const toasts = useSyncExternalStore(subscribe, getToasts, getToasts);
  const [paused, setPaused] = useState(false);

  function handleEnter() { setPaused(true); }
  function handleLeave() { setPaused(false); }

  return (
    <div className="arc-toaster" role="region" aria-label="Notifications" onMouseEnter={handleEnter} onMouseLeave={handleLeave} onFocus={handleEnter} onBlur={handleLeave}>
      {toasts.map(function (item) { return <ToastItem key={item.key} item={item} paused={paused} />; })}
    </div>
  );
}
