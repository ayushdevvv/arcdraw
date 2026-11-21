import { useEffect, useRef } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import "./people.css";

function initial(name) {
  return String(name || "A").trim().slice(0, 1).toUpperCase();
}

function timeAgo(value) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 45) return "just now";
  if (seconds < 3600) return Math.round(seconds / 60) + " min ago";
  if (seconds < 86400) return Math.round(seconds / 3600) + " hr ago";
  return Math.round(seconds / 86400) + " d ago";
}

// Figma style people menu: who is here, and for the owner, who is asking to join.
export default function PeoplePopover({ me, participants, requests, otherRequestCount = 0, isOwner, busyId, colorFor, onResolve, onOpenAll, onClose }) {
  const rootRef = useRef(null);

  useEffect(function () {
    function handlePointer(event) {
      if (rootRef.current && !rootRef.current.contains(event.target) && !event.target.closest("[data-people-trigger]")) onClose();
    }
    function handleKey(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return function () {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const total = participants.length + 1;

  function renderRequest(request) {
    const person = request.user || { name: "Someone", email: "" };
    const busy = busyId === request.id;
    function approve() { onResolve(request, "approved"); }
    function decline() { onResolve(request, "rejected"); }
    return (
      <li className="pp-request" key={request.id}>
        <span className="pp-avatar" style={{ "--avatar-color": colorFor(person.id || request.id) }}>{initial(person.name)}</span>
        <div className="pp-who">
          <strong>{person.name}</strong>
          <small>{person.email || "Wants to edit"}{request.createdAt ? " · " + timeAgo(request.createdAt) : ""}</small>
        </div>
        <div className="pp-actions">
          <button className="pp-btn" type="button" onClick={decline} disabled={busy} aria-label={"Decline " + person.name}><X size={14} /></button>
          <button className="pp-btn is-primary" type="button" onClick={approve} disabled={busy}>
            {busy ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />} Approve
          </button>
        </div>
      </li>
    );
  }

  function renderPerson(person) {
    return (
      <li className="pp-person" key={person.userId}>
        <span className="pp-avatar" style={{ "--avatar-color": colorFor(person.userId) }}>{initial(person.name)}</span>
        <div className="pp-who"><strong>{person.name || "Collaborator"}</strong><small>Online now</small></div>
        <i className="pp-dot" />
      </li>
    );
  }

  return (
    <div className="pp" ref={rootRef} role="dialog" aria-label="People in this room">
      {isOwner && requests.length > 0 && (
        <section className="pp-section">
          <header><h3>Requests to join</h3><span className="pp-count">{requests.length}</span></header>
          <ul>{requests.map(renderRequest)}</ul>
        </section>
      )}
      <section className="pp-section">
        <header><h3>In this room</h3><span className="pp-count">{total}</span></header>
        <ul>
          <li className="pp-person">
            <span className="pp-avatar" style={{ "--avatar-color": colorFor(me.id) }}>{initial(me.name)}</span>
            <div className="pp-who"><strong>{me.name} (you)</strong><small>{me.role}</small></div>
            <i className="pp-dot" />
          </li>
          {participants.map(renderPerson)}
        </ul>
        {isOwner && requests.length === 0 && <p className="pp-empty">No one is waiting to join. New requests show up here the moment they are sent.</p>}
      </section>
      {isOwner && otherRequestCount > 0 && (
        <button className="pp-all" type="button" onClick={onOpenAll}>{otherRequestCount} more {otherRequestCount === 1 ? "request" : "requests"} in your other rooms</button>
      )}
    </div>
  );
}
