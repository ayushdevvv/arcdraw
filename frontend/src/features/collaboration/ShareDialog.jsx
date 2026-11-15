import { useEffect, useState } from "react";
import { Check, Copy, Globe2, Link2, LoaderCircle, LockKeyhole, ShieldCheck, Trash2, UserCheck, X } from "lucide-react";
import Drawer from "../../components/Drawer.jsx";
import { listShareLinks, revokeShareLink, listJoinRequests, resolveJoinRequest } from "../../services/boardCloudService.js";

export default function ShareDialog({ board, link, shareToken = null, onCreate, onClose, busy, isOwner = false, onVisibilityChange }) {
  const [expiresInDays, setExpiresInDays] = useState("never");
  const [shares, setShares] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(Boolean(board?.cloudId));
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const [resolvingId, setResolvingId] = useState("");
  const visibility = board?.visibility || "private";

  const refresh = async () => {
    if (!board?.cloudId) return;
    setLoading(true);
    try { setShares(await listShareLinks(board.cloudId, shareToken)); }
    catch (cause) { setError(cause.message || "Could not load share links."); }
    finally { setLoading(false); }
  };

  const refreshRequests = async () => {
    if (!board?.cloudId || !isOwner) return;
    setRequestsLoading(true);
    try { setRequests(await listJoinRequests(board.cloudId)); }
    catch (cause) { setError(cause.message || "Could not load join requests."); }
    finally { setRequestsLoading(false); }
  };

  useEffect(() => { void refresh(); void refreshRequests(); }, [board?.cloudId, shareToken, isOwner]);

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Clipboard access was blocked. Copy the link from the field.");
    }
  };

  const handleRevoke = async (shareId) => {
    try {
      await revokeShareLink(board.cloudId, shareId, shareToken);
      setShares((current) => current.filter((item) => item.id !== shareId));
    } catch (cause) {
      setError(cause.message || "Could not revoke this link.");
    } finally {
      setConfirmId("");
    }
  };

  const handleRequest = async (requestId, decision) => {
    setResolvingId(requestId);
    try {
      await resolveJoinRequest(board.cloudId, requestId, decision);
      setRequests((current) => current.filter((item) => item.id !== requestId));
    } catch (cause) {
      setError(cause.message || "Could not update this request.");
    } finally {
      setResolvingId("");
    }
  };

  return (
    <Drawer title="Share" subtitle={board?.title || "Room"} icon={<Link2 size={20} strokeWidth={1.8} />} onClose={onClose} busy={busy}>
      <div className="drawer-stack">
        {isOwner && (
          <section className="room-access-section">
            <div className="room-access-heading"><strong>Who can join</strong><span>Room access</span></div>
            <div className="room-access-options">
              <button className={`room-access-option ${visibility === "private" ? "selected" : ""}`} type="button" onClick={() => visibility !== "private" && onVisibilityChange?.("private")} disabled={busy}>
                <span className="room-access-icon"><LockKeyhole size={17} /></span>
                <span><strong>Private</strong><small>People request access. You approve each member.</small></span>
                {visibility === "private" && <Check size={16} />}
              </button>
              <button className={`room-access-option ${visibility === "public" ? "selected" : ""}`} type="button" onClick={() => visibility !== "public" && onVisibilityChange?.("public")} disabled={busy}>
                <span className="room-access-icon"><Globe2 size={17} /></span>
                <span><strong>Public</strong><small>Anyone with the link can join immediately.</small></span>
                {visibility === "public" && <Check size={16} />}
              </button>
            </div>
          </section>
        )}

        <div className="share-preview-note"><ShieldCheck size={16} /><span>Shared links open in view-only mode. People sign in only when they choose to join and edit.</span></div>

        <label className="drawer-field">
          <span>Link expires</span>
          <select value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)}>
            <option value="never">Never</option><option value="1">In 1 day</option><option value="7">In 7 days</option><option value="30">In 30 days</option><option value="90">In 90 days</option>
          </select>
        </label>

        <button className="primary-button drawer-wide" type="button" disabled={busy} onClick={() => onCreate({ permission: "viewer", expiresInDays: expiresInDays === "never" ? null : Number(expiresInDays) })}>
          {busy ? <LoaderCircle className="spin" size={16} /> : <Link2 size={16} />}{busy ? "Creating link…" : link ? "Create another link" : "Create view link"}
        </button>

        {link && (
          <div className="share-created-card">
            <div className="share-created-heading"><Check size={15} /> View link ready</div>
            <div className="share-link-copy-row"><input readOnly value={link} aria-label="Share link" /><button type="button" onClick={copyLink}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy"}</button></div>
          </div>
        )}

        {isOwner && (
          <section className="share-existing-section room-join-requests">
            <div className="share-existing-heading"><span>Join requests{requests.length ? ` · ${requests.length}` : ""}</span><button type="button" onClick={() => void refreshRequests()} disabled={requestsLoading}>Refresh</button></div>
            {requestsLoading ? <p className="arc-dialog-muted">Loading…</p> : requests.length ? requests.map((request) => (
              <div className="drawer-list-row room-join-request" key={request.id}>
                <span className="room-request-avatar">{(request.user?.name || "U").slice(0, 1).toUpperCase()}</span>
                <div><strong>{request.user?.name || "Arcdraw user"}</strong><small>{request.user?.email || "Wants to join this room"}</small></div>
                <span className="room-request-actions">
                  <button type="button" title="Approve" aria-label="Approve request" disabled={resolvingId === request.id} onClick={() => void handleRequest(request.id, "approved")}><UserCheck size={16} /></button>
                  <button type="button" title="Decline" aria-label="Decline request" disabled={resolvingId === request.id} onClick={() => void handleRequest(request.id, "rejected")}><X size={16} /></button>
                </span>
              </div>
            )) : <p className="arc-dialog-muted">No pending requests.</p>}
          </section>
        )}

        <div className="share-existing-section">
          <div className="share-existing-heading"><span>Active links</span><button type="button" onClick={() => void refresh()} disabled={loading}>Refresh</button></div>
          {loading ? <p className="arc-dialog-muted">Loading…</p> : shares.length ? shares.map((item) => (
            <div className="drawer-list-row" key={item.id}>
              <span className="share-role-dot viewer" />
              <div><strong>View link</strong><small>{item.expiresAt ? `Expires ${new Date(item.expiresAt).toLocaleDateString()}` : "No expiry"}</small></div>
              {confirmId === item.id ? (
                <span className="inline-confirm"><button type="button" onClick={() => setConfirmId("")}>Keep</button><button type="button" className="is-danger" onClick={() => void handleRevoke(item.id)}>Revoke</button></span>
              ) : (
                <button className="icon-button" type="button" aria-label="Revoke link" onClick={() => setConfirmId(item.id)}><Trash2 size={15} /></button>
              )}
            </div>
          )) : <p className="arc-dialog-muted">No links yet.</p>}
        </div>
        {error && <p className="drawer-error" role="alert">{error}</p>}
      </div>
    </Drawer>
  );
}
