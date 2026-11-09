import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * Slide-over panel that enters from the right and covers half the screen.
 * Used everywhere a popup or dialog used to appear.
 *
 *   size="half"  -> 50% of the viewport (max 760px)
 *   size="sm"    -> compact 460px, for short forms and confirmations
 */
export default function Drawer({ title, subtitle, icon, size = "half", busy = false, onClose, children, footer, label }) {
  const [closing, setClosing] = useState(false);
  const timer = useRef(null);
  const panelRef = useRef(null);

  const requestClose = useCallback(function () {
    if (busy || closing) return;
    setClosing(true);
    timer.current = window.setTimeout(function () { onClose?.(); }, 210);
  }, [busy, closing, onClose]);

  useEffect(function () {
    return function () { window.clearTimeout(timer.current); };
  }, []);

  useEffect(function () {
    function handleKey(event) { if (event.key === "Escape") requestClose(); }
    document.addEventListener("keydown", handleKey);
    return function () { document.removeEventListener("keydown", handleKey); };
  }, [requestClose]);

  useEffect(function () {
    const field = panelRef.current?.querySelector("[data-autofocus]");
    if (field) field.focus(); else panelRef.current?.focus();
  }, []);

  return (
    <>
      <button className={`drawer-scrim ${closing ? "is-closing" : ""}`} type="button" aria-label="Close panel" tabIndex={-1} onClick={requestClose} />
      <aside ref={panelRef} tabIndex={-1} className={`drawer ${size === "sm" ? "drawer-sm" : ""} ${closing ? "is-closing" : ""}`} role="dialog" aria-modal="true" aria-label={label || title}>
        <header className="drawer-head">
          {icon && <span className="drawer-icon">{icon}</span>}
          <div className="drawer-titles">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button drawer-close" type="button" onClick={requestClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="drawer-body">{typeof children === "function" ? children({ close: requestClose }) : children}</div>
        {footer && <footer className="drawer-foot">{typeof footer === "function" ? footer({ close: requestClose }) : footer}</footer>}
      </aside>
    </>
  );
}
