import { useEffect, useState } from "react";
import { Check, Copy, Link2, LoaderCircle, LockKeyhole, Pencil, Trash2 } from "lucide-react";
import Drawer from "../../components/Drawer.jsx";
import { listShareLinks, revokeShareLink } from "../../services/boardCloudService.js";

export default function ShareDialog({ board, link, shareToken = null, onCreate, onClose, busy }) {
  const [permission, setPermission] = useState("editor");
  const [expiresInDays, setExpiresInDays] = useState("never");
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(Boolean(board?.cloudId));
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState("");

  const refresh = async () => {
    if (!board?.cloudId) return;
    setLoading(true);
    try { setShares(await listShareLinks(board.cloudId, shareToken)); }
    catch (cause) { setError(cause.message || "Could not load share links."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, [board?.cloudId, shareToken]);

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

  return (
    <Drawer title="Share" subtitle={board?.title || "Room"} icon={<Link2 size={20} strokeWidth={1.8} />} onClose={onClose} busy={busy}>
      <div className="drawer-stack">
        <div className="share-permission-grid">
          <label className={`share-permission-option ${permission === "editor" ? "selected" : ""}`}>
            <input type="radio" name="share-permission" value="editor" checked={permission === "editor"} onChange={() => setPermission("editor")} />
            <span className="share-permission-icon"><Pencil size={17} strokeWidth={1.8} /></span>
            <span><strong>Can edit</strong><small>Draw and write</small></span>
          </label>
          <label className={`share-permission-option ${permission === "viewer" ? "selected" : ""}`}>
            <input type="radio" name="share-permission" value="viewer" checked={permission === "viewer"} onChange={() => setPermission("viewer")} />
            <span className="share-permission-icon"><LockKeyhole size={17} strokeWidth={1.8} /></span>
            <span><strong>Can view</strong><small>Look only</small></span>
          </label>
        </div>

        <label className="drawer-field">
          <span>Link expires</span>
          <select value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)}>
            <option value="never">Never</option><option value="1">In 1 day</option><option value="7">In 7 days</option><option value="30">In 30 days</option><option value="90">In 90 days</option>
          </select>
        </label>

        <button className="primary-button drawer-wide" type="button" disabled={busy} onClick={() => onCreate({ permission, expiresInDays: expiresInDays === "never" ? null : Number(expiresInDays) })}>
          {busy ? <LoaderCircle className="spin" size={16} /> : <Link2 size={16} />}{busy ? "Creating link…" : link ? "Create another link" : "Create link"}
        </button>

        {link && (
          <div className="share-created-card">
            <div className="share-created-heading"><Check size={15} /> Link ready</div>
            <div className="share-link-copy-row"><input readOnly value={link} aria-label="Share link" /><button type="button" onClick={copyLink}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy"}</button></div>
          </div>
        )}

        <div className="share-existing-section">
          <div className="share-existing-heading"><span>Active links</span><button type="button" onClick={() => void refresh()} disabled={loading}>Refresh</button></div>
          {loading ? <p className="arc-dialog-muted">Loading…</p> : shares.length ? shares.map((item) => (
            <div className="drawer-list-row" key={item.id}>
              <span className={`share-role-dot ${item.permission}`} />
              <div><strong>{item.permission === "editor" ? "Editor link" : "Viewer link"}</strong><small>{item.expiresAt ? `Expires ${new Date(item.expiresAt).toLocaleDateString()}` : "No expiry"}</small></div>
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
