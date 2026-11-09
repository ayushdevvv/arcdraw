import { useState } from "react";
import { GitPullRequest, LoaderCircle, SlidersHorizontal, Zap } from "lucide-react";
import Drawer from "../../components/Drawer.jsx";

// Owner only. Chooses how everyone works in this room.
export default function ModeDrawer({ current, onSave, onClose }) {
  const [mode, setMode] = useState(current);
  const [busy, setBusy] = useState(false);

  function pickLive() { setMode("live"); }
  function pickCommit() { setMode("commit"); }

  async function handleSave() {
    setBusy(true);
    try {
      await onSave(mode);
      onClose();
    } catch {
      // The caller already showed the error. Keep the drawer open to retry.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title="How this room works"
      subtitle="Only you can change this"
      icon={<SlidersHorizontal size={20} strokeWidth={1.8} />}
      onClose={onClose}
      busy={busy}
      footer={function ({ close }) {
        return (
          <>
            <button className="secondary-button" type="button" onClick={close} disabled={busy}>Cancel</button>
            <button className="primary-button" type="button" disabled={busy || mode === current} onClick={handleSave}>
              {busy && <LoaderCircle size={16} className="spin" />}{busy ? "Saving…" : "Save"}
            </button>
          </>
        );
      }}
    >
      <div className="drawer-stack">
        <div className="share-permission-grid mode-grid">
          <label className={"share-permission-option " + (mode === "live" ? "selected" : "")}>
            <input type="radio" name="work-mode" value="live" checked={mode === "live"} onChange={pickLive} />
            <span className="share-permission-icon"><Zap size={17} strokeWidth={1.8} /></span>
            <span><strong>Live editing</strong><small>Everyone with edit access changes the room at the same time. Best for working together in the moment.</small></span>
          </label>
          <label className={"share-permission-option " + (mode === "commit" ? "selected" : "")}>
            <input type="radio" name="work-mode" value="commit" checked={mode === "commit"} onChange={pickCommit} />
            <span className="share-permission-icon"><GitPullRequest size={17} strokeWidth={1.8} /></span>
            <span><strong>Commit and review</strong><small>Editors work on a private draft and submit it. You review each request and merge or decline it.</small></span>
          </label>
        </div>
        {mode === "commit" && <div className="drawer-note">You still edit the room directly and anything you change is visible to everyone. Editors keep receiving your changes while they draft.</div>}
        {mode === "live" && current === "commit" && <div className="drawer-note">Editors with unsent drafts will be asked to send or discard them. Requests already waiting stay available to review.</div>}
      </div>
    </Drawer>
  );
}
