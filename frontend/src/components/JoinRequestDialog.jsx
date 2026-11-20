import { useEffect } from "react";
import { Check, Inbox, LoaderCircle, RefreshCw, X, XCircle } from "lucide-react";
import "./joinRequests.css";

function initials(name = "Teammate") {
  return String(name).trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
}

function requestTime(value) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const diff = Math.max(0, Date.now() - date.getTime());
  if (diff < 60_000) return "Just now";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}h ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function JoinRequestDialog({ open, onClose, requests = [], loading = false, error = "", resolvingId = "", onRefresh, onResolve }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="join-inbox-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section className="join-inbox-dialog" role="dialog" aria-modal="true" aria-labelledby="join-inbox-title">
        <header className="join-inbox-head">
          <div className="join-inbox-heading-icon"><Inbox size={19} /></div>
          <div className="join-inbox-heading-copy">
            <span>WORKSPACE ACTIVITY</span>
            <h2 id="join-inbox-title">Room requests</h2>
            <p>People asking to collaborate in your rooms.</p>
          </div>
          <div className="join-inbox-head-actions">
            <button type="button" className="join-inbox-refresh" onClick={() => onRefresh?.()} disabled={loading} aria-label="Refresh requests" title="Refresh"><RefreshCw size={15} className={loading ? "join-inbox-spin" : ""} /></button>
            <button type="button" className="join-inbox-close" onClick={onClose} aria-label="Close requests"><X size={17} /></button>
          </div>
        </header>

        <div className="join-inbox-summary">
          <strong>{requests.length} pending {requests.length === 1 ? "request" : "requests"}</strong>
          <span>Approve to give editor access.</span>
        </div>

        {error && <div className="join-inbox-error"><span>{error}</span><button type="button" onClick={() => onRefresh?.()}>Try again</button></div>}

        <div className="join-inbox-list">
          {loading && requests.length === 0 ? (
            <div className="join-inbox-state"><LoaderCircle size={20} className="join-inbox-spin" /><strong>Checking your rooms</strong><span>Loading pending access requests.</span></div>
          ) : requests.length === 0 ? (
            <div className="join-inbox-state"><div className="join-inbox-empty-icon"><Check size={20} /></div><strong>You're all caught up</strong><span>New room requests will appear here as soon as someone asks to join.</span></div>
          ) : requests.map((request) => {
            const person = request.user || {};
            const room = request.board || {};
            const busy = resolvingId === request.id;
            return (
              <article className="join-inbox-request" key={request.id}>
                <div className="join-inbox-person-avatar">
                  {person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : initials(person.name || person.email)}
                </div>
                <div className="join-inbox-request-main">
                  <div className="join-inbox-request-title">
                    <strong>{person.name || "New teammate"}</strong>
                    <time>{requestTime(request.createdAt)}</time>
                  </div>
                  <p>{person.email || "Signed-in collaborator"} wants to join</p>
                  <div className="join-inbox-room"><span className="join-inbox-room-mark" />{room.title || "Untitled room"}<small>{room.kind === "notes" ? "Notes" : "Board"}</small></div>
                  <div className="join-inbox-actions">
                    <button type="button" className="join-inbox-approve" onClick={() => onResolve?.(request, "approved")} disabled={Boolean(resolvingId)}><Check size={14} />{busy ? "Updating…" : "Approve"}</button>
                    <button type="button" className="join-inbox-decline" onClick={() => onResolve?.(request, "rejected")} disabled={Boolean(resolvingId)}><XCircle size={14} />Decline</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <footer className="join-inbox-footer"><span>Only room owners can see and manage these requests.</span></footer>
      </section>
    </div>
  );
}
