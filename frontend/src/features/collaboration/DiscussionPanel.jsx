import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
  const feedRef = useRef(null);
  const pendingComments = useMemo(() => comments.filter((item) => !item.resolved), [comments]);

  useEffect(() => {
    if (tab !== "chat" || !feedRef.current) return;
    const feed = feedRef.current;
    feed.scrollTo({ top: feed.scrollHeight, behavior: "smooth" });
  }, [messages, tab]);

  const formatMessageTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  const formatDay = (value) => {
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString([], { month: "long", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
  };
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

  function handleDraftKey(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitMessage(event);
    }
  }

  return <aside className="room-discussion-panel" aria-label="Room discussion">
    <header className="discussion-head">
      <span className="discussion-live" aria-hidden="true" />
      <h2>Team chat<em>{participants.length + 1} online</em></h2>
      <button type="button" className="discussion-close" onClick={onClose} aria-label="Close discussion"><X size={16} /></button>
    </header>
    <div className="discussion-tabs" role="tablist" aria-label="Discussion views">
      <button type="button" role="tab" aria-selected={tab === "chat"} className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>Chat <b>{messages.length}</b></button>
      <button type="button" role="tab" aria-selected={tab === "comments"} className={tab === "comments" ? "active" : ""} onClick={() => setTab("comments")}>Comments <b>{pendingComments.length}</b></button>
    </div>

    {tab === "chat" ? <>
      <div className="discussion-feed" ref={feedRef} aria-live="polite">
        {messages.length ? messages.map(function (message, index) {
          const mine = message.authorId && message.authorId === currentUser?.id;
          const previous = messages[index - 1];
          const newDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
          return <Fragment key={message.id}>
            {newDay && <div className="discussion-day"><span>{formatDay(message.createdAt)}</span></div>}
            <article className={"discussion-message" + (mine ? " mine" : "")}>
              <div className="discussion-message-meta"><strong>{mine ? "You" : message.authorName || "Collaborator"}</strong><time>{formatMessageTime(message.createdAt)}</time></div>
              <p>{message.body}</p>
            </article>
          </Fragment>;
        }) : <div className="discussion-empty"><MessageSquare size={22} /><strong>No messages yet</strong><span>Say hello to everyone in this room.</span></div>}
      </div>
      <form className="discussion-composer" onSubmit={submitMessage}>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleDraftKey} placeholder={readOnly ? "Viewer access is read only" : "Message the team…"} maxLength={2000} disabled={readOnly} aria-label="Message" />
        <button type="submit" disabled={readOnly || !draft.trim()} aria-label="Send message"><Send size={15} /></button>
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
