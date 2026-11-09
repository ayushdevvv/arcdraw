import { useEffect, useState } from "react";
import { exportToBlob } from "@excalidraw/excalidraw";
import { Check, GitMerge, GitPullRequest, LoaderCircle, Undo2, X } from "lucide-react";
import Drawer from "../../components/Drawer.jsx";
import {
  listProposals, getProposalPreview, acceptProposal, rejectProposal, withdrawProposal
} from "../../services/boardCloudService.js";
import { toast } from "../../components/toast/toastStore.js";
import { friendlyError } from "../../utils/errors.js";

function whenLabel(value) {
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function chips(summary) {
  const list = [];
  function add(label, added, updated, deleted) {
    if (added) list.push("+" + added + " " + label);
    if (updated) list.push(updated + " " + label + " edited");
    if (deleted) list.push(deleted + " " + label + " removed");
  }
  add("shapes", summary.elementsAdded, summary.elementsUpdated, summary.elementsDeleted);
  add("images", summary.filesAdded, summary.filesUpdated, summary.filesDeleted);
  add("notes", summary.notesAdded, summary.notesUpdated, summary.notesDeleted);
  add("tasks", summary.projectItemsAdded, summary.projectItemsUpdated, summary.projectItemsDeleted);
  return list;
}

async function renderThumb(part, files) {
  const blob = await exportToBlob({
    elements: part.elements,
    appState: { exportBackground: true, viewBackgroundColor: part.appState?.viewBackgroundColor || "#ffffff" },
    files,
    mimeType: "image/png",
    maxWidthOrHeight: 520
  });
  return URL.createObjectURL(blob);
}

function Proposal({ item, isOwner, shareToken, boardId, onChanged }) {
  const [open, setOpen] = useState(false);
  const [thumbs, setThumbs] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [busy, setBusy] = useState("");
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const pending = item.status === "pending";

  useEffect(function () {
    return function () {
      if (thumbs) { URL.revokeObjectURL(thumbs.before); URL.revokeObjectURL(thumbs.after); }
    };
  }, [thumbs]);

  async function togglePreview() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (thumbs) return;
    setLoadingPreview(true);
    try {
      const preview = await getProposalPreview(boardId, item.id, shareToken);
      const before = await renderThumb(preview.before, preview.files);
      const after = await renderThumb(preview.after, preview.files);
      setThumbs({ before: before, after: after });
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't load the preview."));
      setOpen(false);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function run(kind, action, okMessage) {
    setBusy(kind);
    try {
      await action();
      toast.success(okMessage);
      onChanged();
    } catch (error) {
      toast.error(friendlyError(error, "That didn't work. Please try again."));
      if (error.status === 409) onChanged();
    } finally {
      setBusy("");
    }
  }

  function handleAccept() { void run("accept", function () { return acceptProposal(boardId, item.id, shareToken); }, "Changes merged into the room."); }
  function handleDecline() { void run("decline", function () { return rejectProposal(boardId, item.id, note.trim(), shareToken); }, "Request declined."); }
  function handleWithdraw() { void run("withdraw", function () { return withdrawProposal(boardId, item.id, shareToken); }, "Request withdrawn."); }
  function startDecline() { setDeclining(true); }
  function cancelDecline() { setDeclining(false); }
  function handleNote(event) { setNote(event.target.value); }

  const list = chips(item.summary || {});
  return (
    <article className="review-item">
      <div className="review-top">
        <strong>{item.message}</strong>
        {!pending && <em className={"review-status is-" + item.status}>{item.status === "accepted" ? "Merged" : item.status === "rejected" ? "Declined" : "Withdrawn"}</em>}
      </div>
      <div className="history-meta"><span>{isOwner ? item.author?.name || "Member" : "You"}</span><span>{whenLabel(item.createdAt)}</span></div>
      {list.length > 0 && <div className="review-chips">{list.map(function (text) { return <span key={text}>{text}</span>; })}</div>}
      {item.note && <p className="review-note">Owner note: {item.note}</p>}

      {pending && isOwner && (
        <>
          <button className="review-link" type="button" onClick={togglePreview}>{open ? "Hide preview" : "Preview changes"}</button>
          {open && (
            <div className="review-preview">
              {loadingPreview || !thumbs ? <span className="review-loading"><LoaderCircle size={15} className="spin" /> Rendering preview…</span> : (
                <>
                  <figure><img src={thumbs.before} alt="Room now" /><figcaption>Room now</figcaption></figure>
                  <figure><img src={thumbs.after} alt="After merge" /><figcaption>After merge</figcaption></figure>
                </>
              )}
            </div>
          )}
          {declining ? (
            <div className="review-decline">
              <textarea rows={2} maxLength={280} value={note} onChange={handleNote} placeholder="Optional note for the author" aria-label="Note for the author" />
              <div className="review-actions">
                <button className="secondary-button" type="button" onClick={cancelDecline} disabled={Boolean(busy)}>Back</button>
                <button className="primary-button danger-button" type="button" onClick={handleDecline} disabled={Boolean(busy)}>{busy === "decline" ? <LoaderCircle size={15} className="spin" /> : <X size={15} />}Decline</button>
              </div>
            </div>
          ) : (
            <div className="review-actions">
              <button className="secondary-button" type="button" onClick={startDecline} disabled={Boolean(busy)}><X size={15} />Decline</button>
              <button className="primary-button" type="button" onClick={handleAccept} disabled={Boolean(busy)}>{busy === "accept" ? <LoaderCircle size={15} className="spin" /> : <GitMerge size={15} />}Merge changes</button>
            </div>
          )}
        </>
      )}
      {pending && !isOwner && (
        <div className="review-actions">
          <button className="secondary-button" type="button" onClick={handleWithdraw} disabled={Boolean(busy)}>{busy === "withdraw" ? <LoaderCircle size={15} className="spin" /> : <Undo2 size={15} />}Withdraw</button>
        </div>
      )}
    </article>
  );
}

export default function ReviewDrawer({ boardId, shareToken, isOwner, refreshKey, onClose, onChanged }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(function () {
    let active = true;
    setLoading(true);
    listProposals(boardId, { shareToken: shareToken })
      .then(function (result) { if (active) { setItems(result.proposals); setFailed(""); } })
      .catch(function (error) { if (active) setFailed(friendlyError(error, "Couldn't load review requests.")); })
      .finally(function () { if (active) setLoading(false); });
    return function () { active = false; };
  }, [boardId, shareToken, refreshKey, reload]);

  function handleChanged() {
    setReload(function (value) { return value + 1; });
    if (onChanged) onChanged();
  }
  function handleRetry() { setReload(function (value) { return value + 1; }); }

  const pending = items.filter(function (item) { return item.status === "pending"; });
  const resolved = items.filter(function (item) { return item.status !== "pending"; }).slice(0, 12);

  return (
    <Drawer title={isOwner ? "Review requests" : "My requests"} subtitle={isOwner ? "Changes people want to add to this room" : "Changes you sent to the owner"} icon={<GitPullRequest size={20} strokeWidth={1.8} />} onClose={onClose}>
      {loading && !items.length ? <div className="history-empty"><LoaderCircle size={18} className="spin" /> Loading…</div>
        : failed ? <div className="history-empty"><strong>{failed}</strong><button className="secondary-button" type="button" onClick={handleRetry}>Try again</button></div>
        : !items.length ? <div className="history-empty"><Check size={24} /><strong>{isOwner ? "Nothing to review" : "No requests yet"}</strong><span>{isOwner ? "Requests from editors show up here." : "Submit your draft to start one."}</span></div>
        : (
          <div className="review-list">
            {pending.length > 0 && <h3 className="review-heading">Waiting for review</h3>}
            {pending.map(function (item) { return <Proposal key={item.id} item={item} isOwner={isOwner} shareToken={shareToken} boardId={boardId} onChanged={handleChanged} />; })}
            {resolved.length > 0 && <h3 className="review-heading">Earlier</h3>}
            {resolved.map(function (item) { return <Proposal key={item.id} item={item} isOwner={isOwner} shareToken={shareToken} boardId={boardId} onChanged={handleChanged} />; })}
          </div>
        )}
    </Drawer>
  );
}
