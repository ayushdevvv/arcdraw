import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  Bold, Check, Code2, Eye, FileText, Heading1, Italic, Link2,
  List, ListChecks, LoaderCircle, Plus, Quote, Search, Trash2
} from "lucide-react";
import "../../notes.css";

function relativeTime(value) {
  if (!value) return "Just now";
  const date = new Date(value);
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function InlineMarkdown({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|~~[^~]+~~)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("~~") && part.endsWith("~~")) return <del key={index}>{part.slice(2, -2)}</del>;
    return <span key={index}>{part}</span>;
  });
}

function MarkdownPreview({ value }) {
  const lines = String(value || "").split("\n");
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (line.startsWith("```")) {
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) code.push(lines[index++]);
      index += 1;
      blocks.push(<pre key={`code-${index}`}><code>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const Tag = `h${heading[1].length}`;
      blocks.push(<Tag key={`h-${index}`}><InlineMarkdown text={heading[2]} /></Tag>);
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      blocks.push(<blockquote key={`q-${index}`}><InlineMarkdown text={line.replace(/^>\s?/, "")} /></blockquote>);
      index += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\.\s+/.test(line);
      const items = [];
      while (index < lines.length && (/^[-*]\s+/.test(lines[index]) || /^\d+\.\s+/.test(lines[index]))) {
        items.push(lines[index].replace(/^(?:[-*]|\d+\.)\s+/, ""));
        index += 1;
      }
      const Tag = ordered ? "ol" : "ul";
      blocks.push(<Tag key={`list-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}><InlineMarkdown text={item.replace(/^\[([ xX])\]\s*/, "")} />{/^\[[ xX]\]/.test(item) && <span className="notes-preview-check">{item[1].toLowerCase() === "x" ? "✓" : "○"}</span>}</li>)}</Tag>);
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,3}\s|```|>\s?|[-*]\s+|\d+\.\s+)/.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={`p-${index}`}><InlineMarkdown text={paragraph.join(" ")} /></p>);
  }
  return <div className="notes-markdown-preview">{blocks.length ? blocks : <p className="notes-preview-empty">Nothing to preview yet. Start writing in Markdown.</p>}</div>;
}

function insertMarkdown(textarea, value, setValue, prefix, suffix = "", placeholder = "text") {
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = value.slice(start, end) || placeholder;
  const replacement = `${prefix}${selected}${suffix}`;
  const next = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
  setValue(next);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
  });
  return next;
}

function mapSelectionPosition(previous, next, position) {
  let prefix = 0;
  while (prefix < Math.min(previous.length, next.length) && previous[prefix] === next[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < previous.length - prefix && suffix < next.length - prefix && previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix += 1;
  if (position <= prefix) return position;
  if (position >= previous.length - suffix) return Math.max(prefix, position + next.length - previous.length);
  return Math.min(next.length, prefix + Math.max(0, next.length - prefix - suffix));
}

function RoomNotesPanel({
  notes = [],
  loading = false,
  readOnly = false,
  syncLabel = "Saved on this device",
  selectedElementId = null,
  focusNoteId = null,
  onClose,
  onCreate,
  onUpdate,
  onContentInput,
  onDelete,
  onAttachSelection,
  standalone = false
}, ref) {
  const [activeId, setActiveId] = useState(null);
  const [query, setQuery] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [mode, setMode] = useState("write");
  const [saveState, setSaveState] = useState("saved");
  const textareaRef = useRef(null);
  const saveTimerRef = useRef(null);
  const pendingDraftRef = useRef(null);
  const lastLocalContentRef = useRef("");
  const lastLocalTitleRef = useRef("");
  const activeNote = notes.find((note) => note.id === activeId) || notes[0] || null;

  useEffect(() => {
    if (focusNoteId && notes.some((note) => note.id === focusNoteId)) setActiveId(focusNoteId);
  }, [focusNoteId, notes]);

  useEffect(() => {
    if (!activeId && notes.length) setActiveId(notes[0].id);
    if (activeId && !notes.some((note) => note.id === activeId)) setActiveId(notes[0]?.id || null);
  }, [notes, activeId]);

  useEffect(() => {
    if (!activeNote) {
      setDraftTitle("");
      setDraftContent("");
      lastLocalTitleRef.current = "";
      lastLocalContentRef.current = "";
      return;
    }
    setDraftTitle(activeNote.title || "Untitled note");
    setDraftContent(activeNote.content || "");
    lastLocalTitleRef.current = activeNote.title || "Untitled note";
    lastLocalContentRef.current = activeNote.content || "";
  }, [activeNote?.id]);

  // Remote Yjs updates are persisted into Dexie by the parent. Update the open
  // editor only when the persisted content differs from our own last write.
  useEffect(() => {
    if (!activeNote) return;
    const incomingContent = activeNote.content || "";
    if (incomingContent !== lastLocalContentRef.current) {
      const previousDraft = draftContent;
      const textarea = textareaRef.current;
      const keepSelection = textarea && document.activeElement === textarea;
      const selectionStart = keepSelection ? textarea.selectionStart : null;
      const selectionEnd = keepSelection ? textarea.selectionEnd : null;
      lastLocalContentRef.current = incomingContent;
      setDraftContent(incomingContent);
      // A remote CRDT merge may arrive while this note is focused. Keep the
      // caret near its previous logical position instead of jumping to zero.
      if (keepSelection) {
        requestAnimationFrame(() => {
          if (!textareaRef.current) return;
          textareaRef.current.setSelectionRange(
            mapSelectionPosition(previousDraft, incomingContent, selectionStart),
            mapSelectionPosition(previousDraft, incomingContent, selectionEnd)
          );
        });
      }
    }
    if (activeNote.title !== lastLocalTitleRef.current) {
      lastLocalTitleRef.current = activeNote.title || "Untitled note";
      setDraftTitle(activeNote.title || "Untitled note");
    }
  }, [activeNote?.content, activeNote?.title, activeNote?.updatedAt]);

  const persistDraft = useCallback(async (draft) => {
    if (!draft) return;
    try {
      await onUpdate(draft.noteId, { title: draft.title, content: draft.content });
      lastLocalTitleRef.current = draft.title;
      lastLocalContentRef.current = draft.content;
      const pending = pendingDraftRef.current;
      const isLatestPending = pending?.noteId === draft.noteId
        && pending.title === draft.title
        && pending.content === draft.content;
      if (isLatestPending) {
        pendingDraftRef.current = null;
        setSaveState("saved");
      } else if (pending?.noteId === draft.noteId) {
        // An older async write finished while a newer draft was being typed.
        // Keep the newer draft queued and do not show a false saved state.
        setSaveState("saving");
      }
    } catch (error) {
      console.error("Note save failed:", error);
      setSaveState("error");
      throw error;
    }
  }, [onUpdate]);

  const flushActiveDraft = useCallback(async () => {
    window.clearTimeout(saveTimerRef.current);
    if (!activeNote || readOnly) return;
    const latest = {
      noteId: activeNote.id,
      title: draftTitle.trim() || "Untitled note",
      content: draftContent
    };
    const pending = pendingDraftRef.current;
    if (pending || latest.title !== lastLocalTitleRef.current || latest.content !== lastLocalContentRef.current) {
      pendingDraftRef.current = latest;
      await persistDraft(latest);
    }
  }, [activeNote?.id, draftTitle, draftContent, readOnly, persistDraft]);

  useImperativeHandle(ref, () => ({ flush: flushActiveDraft }), [flushActiveDraft]);

  useEffect(() => {
    if (!activeNote || readOnly) return undefined;
    const title = draftTitle.trim() || "Untitled note";
    if (title === lastLocalTitleRef.current && draftContent === lastLocalContentRef.current) return undefined;

    const draft = { noteId: activeNote.id, title, content: draftContent };
    pendingDraftRef.current = draft;
    setSaveState("saving");
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void persistDraft(draft).catch(() => {});
    }, 320);

    return () => window.clearTimeout(saveTimerRef.current);
  }, [activeNote?.id, draftTitle, draftContent, readOnly, onUpdate]);

  // If Notes Studio closes or the user switches notes during the debounce
  // window, persist the outgoing note's final draft.
  useEffect(() => () => {
    window.clearTimeout(saveTimerRef.current);
    const pending = pendingDraftRef.current;
    if (pending && pending.noteId === activeNote?.id) {
      pendingDraftRef.current = null;
      void onUpdate(pending.noteId, { title: pending.title, content: pending.content })
        .catch((error) => console.error("Final note save failed:", error));
    }
  }, [activeNote?.id, onUpdate]);

  const filteredNotes = useMemo(() => notes.filter((note) => `${note.title} ${note.content}`.toLowerCase().includes(query.toLowerCase())), [notes, query]);
  const wordCount = draftContent.trim() ? draftContent.trim().split(/\s+/).length : 0;
  const charCount = draftContent.length;

  const create = async () => {
    try {
      await flushActiveDraft();
      const note = await onCreate();
      if (note?.id) {
        setActiveId(note.id);
        setMode("write");
      }
    } catch (error) {
      console.error("Could not create note:", error);
      setSaveState("error");
    }
  };

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const selectNote = async (noteId) => {
    if (noteId === activeNote?.id) return;
    try {
      await flushActiveDraft();
      setActiveId(noteId);
      setMode("write");
    } catch (error) {
      console.error("Could not switch notes because the current draft failed to save:", error);
      setSaveState("error");
    }
  };

  const removeActive = async () => {
    if (!activeNote) return;
    setConfirmingDelete(false);
    try {
      await flushActiveDraft();
      await onDelete(activeNote.id);
      pendingDraftRef.current = null;
      setActiveId(notes.find((note) => note.id !== activeNote.id)?.id || null);
    } catch (error) {
      console.error("Could not delete note:", error);
      setSaveState("error");
    }
  };

  const format = (prefix, suffix = "", placeholder = "text") => {
    const next = insertMarkdown(textareaRef.current, draftContent, setDraftContent, prefix, suffix, placeholder);
    if (next !== undefined && activeNote?.id) onContentInput?.(activeNote.id, next);
  };

  function handleQuery(event) { setQuery(event.target.value); }
  function handleTitle(event) { setDraftTitle(event.target.value); }
  function handleContent(event) {
    const nextContent = event.target.value;
    setDraftContent(nextContent);
    onContentInput?.(activeNote.id, nextContent);
  }
  function modeWrite() { setMode("write"); }
  function modePreview() { setMode("preview"); }
  function attachSelection() { onAttachSelection?.(activeNote.id, selectedElementId); }
  function pickNote(noteId) { return function () { void selectNote(noteId); }; }
  function fmt(prefix, suffix, placeholder) { return function () { format(prefix, suffix, placeholder); }; }
  const saveText = saveState === "saving" ? "Saving" : saveState === "error" ? "Save failed" : syncLabel;

  return (
    <div className="nt" aria-label="Notes workspace">
      <aside className="nt-side">
        <div className="nt-side-head">
          <h2>Notes <span>{notes.length}</span></h2>
          {!readOnly && <button className="nt-add" type="button" onClick={create} aria-label="New note" data-tip="New note"><Plus size={16} /></button>}
        </div>
        <label className="nt-search"><Search size={15} /><input value={query} onChange={handleQuery} placeholder="Search notes" aria-label="Search notes" /></label>
        <div className="nt-list">
          {loading ? <div className="nt-empty-list"><LoaderCircle className="spin" size={18} /> Loading</div> : filteredNotes.length ? filteredNotes.map(function (note) {
            return (
              <button key={note.id} type="button" className={`nt-item ${activeNote?.id === note.id ? "is-active" : ""}`} onClick={pickNote(note.id)}>
                <strong>{note.title || "Untitled note"}</strong>
                <small>{(note.content || "No content yet").replace(/[#*`>\-]/g, "").slice(0, 70) || "No content yet"}</small>
                <em>{relativeTime(note.updatedAt)}{note.linkedElementId ? " · Linked" : ""}</em>
              </button>
            );
          }) : <div className="nt-empty-list"><FileText size={20} /><strong>No notes yet</strong><span>Create one to start writing.</span></div>}
        </div>
      </aside>

      <section className="nt-main">
        {activeNote ? (
          <>
            <div className="nt-bar">
              <div className="nt-modes" role="tablist" aria-label="Editor mode">
                <button type="button" role="tab" aria-selected={mode === "write"} className={mode === "write" ? "is-active" : ""} onClick={modeWrite}>Write</button>
                <button type="button" role="tab" aria-selected={mode === "preview"} className={mode === "preview" ? "is-active" : ""} onClick={modePreview}><Eye size={14} /> Preview</button>
              </div>
              <span className="nt-save"><i className={saveState} />{saveText}</span>
              <div className="nt-bar-actions">
                {selectedElementId && !readOnly && <button className="secondary-button nt-small" type="button" onClick={attachSelection}><Link2 size={14} /> Link selection</button>}
                {!readOnly && (confirmingDelete
                  ? <span className="inline-confirm"><button type="button" onClick={() => setConfirmingDelete(false)}>Keep</button><button type="button" className="is-danger" onClick={removeActive}>Delete note</button></span>
                  : <button className="icon-button" type="button" onClick={() => setConfirmingDelete(true)} aria-label="Delete note" data-tip="Delete note"><Trash2 size={15} /></button>)}
              </div>
            </div>
            <div className="nt-scroll">
              <div className="nt-page">
                <input className="nt-title" value={draftTitle} onChange={handleTitle} maxLength={120} readOnly={readOnly} aria-label="Note title" placeholder="Untitled note" />
                <p className="nt-meta">EDITED {relativeTime(activeNote.updatedAt).toUpperCase()}{activeNote.linkedElementId ? " · LINKED TO CANVAS" : " · MARKDOWN"}</p>
                {mode === "write" ? (
                  <textarea
                    ref={textareaRef}
                    className="nt-input"
                    value={draftContent}
                    onChange={handleContent}
                    placeholder={"Start writing.\n\nUse Markdown for headings, lists, checklists and code."}
                    readOnly={readOnly}
                    spellCheck="true"
                  />
                ) : <div className="notes-preview-scroll nt-preview"><MarkdownPreview value={draftContent} /></div>}
              </div>
            </div>
            {mode === "write" && !readOnly && (
              <div className="nt-format" role="toolbar" aria-label="Markdown formatting">
                <button type="button" aria-label="Heading" data-tip="Heading" onClick={fmt("## ", "", "Heading")}><Heading1 size={16} /></button>
                <button type="button" aria-label="Bold" data-tip="Bold" onClick={fmt("**", "**", "bold text")}><Bold size={15} /></button>
                <button type="button" aria-label="Italic" data-tip="Italic" onClick={fmt("*", "*", "italic text")}><Italic size={15} /></button>
                <span />
                <button type="button" aria-label="Bullet list" data-tip="Bullet list" onClick={fmt("- ", "", "List item")}><List size={15} /></button>
                <button type="button" aria-label="Checklist" data-tip="Checklist" onClick={fmt("- [ ] ", "", "Task")}><ListChecks size={15} /></button>
                <button type="button" aria-label="Quote" data-tip="Quote" onClick={fmt("> ", "", "Quote")}><Quote size={15} /></button>
                <button type="button" aria-label="Code" data-tip="Code" onClick={fmt("`", "`", "code")}><Code2 size={15} /></button>
              </div>
            )}
            <div className="nt-count">{wordCount} WORDS · {charCount} CHARACTERS</div>
          </>
        ) : (
          <div className="nt-first">
            <span className="nt-first-icon"><FileText size={24} /></span>
            <h3>Start writing.</h3>
            <p>Keep decisions, research and checklists in one calm place.</p>
            {!readOnly && <button className="primary-button" type="button" onClick={create}><Plus size={16} /> Create a note</button>}
          </div>
        )}
      </section>
    </div>
  );
}

export default forwardRef(RoomNotesPanel);
