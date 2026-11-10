import { useMemo, useState } from "react";
import { AtSign, Check, MessageCircle, MessageSquare, Send, X } from "lucide-react";
import "./discussion.css";

function initials(name = "Collaborator") {
  return String(name).trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
}

export default function DiscussionPanel({ messages = [], comments = [], participants = [], selectedElementId = null, readOnly = false, currentUser, onSendMessage, onAddComment, onResolveComment, onClose, onFocusElement }) {
  const [tab, setTab] = useState("chat");
  const [draft, setDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [showAllComments, setShowAllComments] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const pendingComments = useMemo(() => comments.filter((item) => !item.resolved), [comments]);
  const visibleComments = showAllComments ? comments : pendingComments;

  const submitMessage = (event) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || readOnly) return;
    const accepted = onSendMessage?.(body);
    if (accepted !== false) setDraft("");
  };

  const submitComment = (event) => {
    event.preventDefault();
    const body = commentDraft.trim();
    if (!body || readOnly) return;
    const anchorElementId = replyingTo?.elementId || selectedElementId || null;
    const accepted = onAddComment?.(body, anchorElementId, replyingTo?.id || null);
    if (accepted !== false) { setCommentDraft(""); setReplyingTo(null); }
  };

  return <aside className="room-discussion-panel" aria-label="Room discussion">
    <header className="discussion-head">
      <div className="discussion-icon"><MessageCircle size={18} /></div>
      <div><span>ROOM CONVERSATION</span><h2>Discussion</h2></div>
      <div className="discussion-presence" title={`${participants.length} people here`}><i />{participants.length} online</div>
      <button type="button" className="discussion-close" onClick={onClose} aria-label="Close discussion"><X size={17} /></button>
    </header>
    <div className="discussion-tabs" role="tablist" aria-label="Discussion views">
      <button type="button" role="tab" aria-selected={tab === "chat"} className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}><MessageSquare size={14} /> Chat <b>{messages.length}</b></button>
      <button type="button" role="tab" aria-selected={tab === "comments"} className={tab === "comments" ? "active" : ""} onClick={() => setTab("comments")}><MessageCircle size={14} /> Comments <b>{pendingComments.length}</b></button>
    </div>

    {tab === "chat" ? <>
      <div className="discussion-feed" aria-live="polite">
        {messages.length ? messages.map((message) => {
          const mine = message.authorId && message.authorId === currentUser?.id;
          return <article className={`discussion-message ${mine ? "mine" : ""}`} key={message.id}>
            <div className="discussion-avatar">{initials(message.authorName)}</div>
            <div className="discussion-message-body"><div className="discussion-message-meta"><strong>{mine ? "You" : message.authorName || "Collaborator"}</strong><time>{new Date(message.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></div><p>{message.body}</p></div>
          </article>;
        }) : <div className="discussion-empty"><MessageSquare size={22} /><strong>No messages yet</strong><span>Start a conversation with everyone in this room.</span></div>}
      </div>
      <form className="discussion-composer" onSubmit={submitMessage}>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={readOnly ? "Viewer access is read-only" : "Message the room…"} rows={3} maxLength={2000} disabled={readOnly} />
        <div><span>{draft.length}/2000</span><button type="submit" disabled={readOnly || !draft.trim()}><Send size={14} /> Send</button></div>
      </form>
    </> : <>
      <div className="discussion-comment-toolbar"><div><strong>Canvas comments</strong><span>Attach feedback to a selected object.</span></div><button type="button" onClick={() => setShowAllComments((value) => !value)}>{showAllComments ? "Open only" : "Show resolved"}</button></div>
      <form className="discussion-comment-form" onSubmit={submitComment}>
        {replyingTo && <div className="discussion-replying">Replying to <strong>{replyingTo.authorName || "Collaborator"}</strong><button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply"><X size={13} /></button></div>}
        {replyingTo ? <div className="discussion-anchor"><AtSign size={13} /> Reply in thread{replyingTo.elementId ? <> · canvas object <code>{replyingTo.elementId.slice(0, 8)}</code></> : " · room discussion"}</div> : selectedElementId ? <div className="discussion-anchor"><AtSign size={13} /> Comment on selected canvas object <code>{selectedElementId.slice(0, 8)}</code></div> : <div className="discussion-anchor">Select an object on the canvas to anchor feedback, or leave it unlinked.</div>}
        <textarea value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder={readOnly ? "Viewer access is read-only" : "Add a comment…"} rows={3} maxLength={2000} disabled={readOnly} />
        <button type="submit" disabled={readOnly || !commentDraft.trim()}><Send size={13} /> Add comment</button>
      </form>
      <div className="discussion-comments-list">
        {visibleComments.length ? visibleComments.map((comment) => <article className={`discussion-comment ${comment.resolved ? "resolved" : ""} ${comment.parentId ? "is-reply" : ""}`} key={comment.id}>
          <div className="discussion-comment-meta"><div className="discussion-avatar">{initials(comment.authorName)}</div><div><strong>{comment.authorName || "Collaborator"}</strong><time>{new Date(comment.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></div><span className="discussion-comment-status">{comment.resolved ? "Resolved" : "Open"}</span></div>
          <p>{comment.body}</p>
          <div className="discussion-comment-actions">{comment.elementId && <button type="button" onClick={() => onFocusElement?.(comment.elementId)}>View object</button>}{!comment.resolved && !readOnly && <button type="button" onClick={() => { setReplyingTo(comment); setCommentDraft(""); }}>Reply</button>}{!readOnly && !comment.parentId && <button type="button" onClick={() => onResolveComment?.(comment.id, !comment.resolved)}>{comment.resolved ? "Reopen" : <><Check size={12} /> Resolve</>}</button>}</div>
        </article>) : <div className="discussion-empty"><MessageCircle size={22} /><strong>No comments yet</strong><span>Leave feedback directly on canvas objects.</span></div>}
      </div>
    </>}
  </aside>;
}
