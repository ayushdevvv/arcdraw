import { useState } from "react";
import { GitCommit, GitPullRequest, LoaderCircle } from "lucide-react";
import Drawer from "../../components/Drawer.jsx";

function summaryLine(summary) {
  if (!summary) return "";
  const parts = [];
  const add = function (label, part) {
    const count = part.added + part.updated + part.deleted;
    if (count) parts.push(count + " " + label);
  };
  add("shapes", summary.elements);
  add("images", summary.files);
  add("notes", summary.notes);
  add("tasks", summary.projectItems);
  add("messages", summary.messages);
  add("comments", summary.comments);
  add("design library items", summary.designStudio);
  return parts.join(", ");
}

// Used for two things: saving a version (owner) and submitting a draft for review (editor).
export default function CommitDialog({ onClose, onCommit, busy, mode = "version", summary = null }) {
  const [message, setMessage] = useState("");
  const isSubmit = mode === "submit";

  function handleMessage(event) { setMessage(event.target.value); }
  function handleSave() { onCommit(message.trim()); }

  return (
    <Drawer
      title={isSubmit ? "Submit for review" : "Save a version"}
      subtitle={isSubmit ? "The owner decides what joins the room" : "Checkpoint this room"}
      icon={isSubmit ? <GitPullRequest size={20} strokeWidth={1.8} /> : <GitCommit size={20} strokeWidth={1.8} />}
      onClose={onClose}
      busy={busy}
      footer={function ({ close }) {
        return (
          <>
            <button className="secondary-button" type="button" onClick={close} disabled={busy}>Cancel</button>
            <button className="primary-button" type="button" disabled={busy || !message.trim()} onClick={handleSave}>
              {busy ? <LoaderCircle size={16} className="spin" /> : isSubmit ? <GitPullRequest size={16} /> : <GitCommit size={16} />}
              {busy ? (isSubmit ? "Submitting…" : "Saving…") : (isSubmit ? "Submit changes" : "Save version")}
            </button>
          </>
        );
      }}
    >
      {isSubmit && summary && <div className="drawer-note">You are sending {summaryLine(summary) || "your changes"}. Nothing changes in the room until the owner merges it.</div>}
      <label className="drawer-field">
        <span>{isSubmit ? "What did you change?" : "What changed?"}</span>
        <textarea data-autofocus maxLength={140} rows={4} value={message} onChange={handleMessage} placeholder={isSubmit ? "Reworked the signup flow" : "Added onboarding flow"} />
        <small className="drawer-count">{message.length}/140</small>
      </label>
    </Drawer>
  );
}
