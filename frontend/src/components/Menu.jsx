import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

/**
 * A small, accessible dropdown. `items` is an array of:
 *   { label, icon, shortcut, onSelect, danger, disabled, checked }
 *   { type: "separator" }
 *   { type: "heading", label }
 * `renderTrigger({ open, toggle, ref })` draws the button that opens it.
 */
function MenuItem({ item, onPick }) {
  function handleClick() {
    onPick(item);
  }
  return (
    <button
      className={`menu-item ${item.danger ? "is-danger" : ""} ${item.checked ? "is-checked" : ""}`}
      type="button"
      role="menuitem"
      disabled={item.disabled}
      onClick={handleClick}
    >
      <span className="menu-item-icon">{item.icon}</span>
      <span className="menu-item-label">{item.label}</span>
      {item.shortcut && <kbd className="menu-item-shortcut">{item.shortcut}</kbd>}
      {item.checked && <Check className="menu-item-check" size={14} />}
    </button>
  );
}

export default function Menu({ renderTrigger, items, align = "end", side = "bottom", width = 248, label = "Menu" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const panelRef = useRef(null);

  function toggle() {
    setOpen(function (value) { return !value; });
  }

  function close() {
    setOpen(false);
  }

  function handlePick(item) {
    if (item.disabled) return;
    close();
    if (item.onSelect) item.onSelect();
  }

  useEffect(function () {
    if (!open) return undefined;

    function handlePointer(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) close();
    }
    function handleKey(event) {
      if (event.key === "Escape") {
        close();
        const trigger = wrapRef.current?.querySelector("[data-menu-trigger]");
        if (trigger) trigger.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    const first = panelRef.current?.querySelector(".menu-item:not(:disabled)");
    if (first) first.focus();
    return function () {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function handlePanelKey(event) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const nodes = Array.from(panelRef.current.querySelectorAll(".menu-item:not(:disabled)"));
    if (!nodes.length) return;
    const index = nodes.indexOf(document.activeElement);
    const next = event.key === "ArrowDown" ? (index + 1) % nodes.length : (index - 1 + nodes.length) % nodes.length;
    nodes[next].focus();
  }

  return (
    <div className="menu" ref={wrapRef}>
      {renderTrigger({ open, toggle })}
      {open && (
        <div
          className={`menu-panel menu-${side} menu-align-${align}`}
          style={{ width }}
          role="menu"
          aria-label={label}
          ref={panelRef}
          onKeyDown={handlePanelKey}
        >
          {items.map(function (item, index) {
            if (item.type === "separator") return <div className="menu-separator" role="separator" key={`s-${index}`} />;
            if (item.type === "heading") return <p className="menu-heading" key={`h-${index}`}>{item.label}</p>;
            return <MenuItem key={`${item.label}-${index}`} item={item} onPick={handlePick} />;
          })}
        </div>
      )}
    </div>
  );
}
