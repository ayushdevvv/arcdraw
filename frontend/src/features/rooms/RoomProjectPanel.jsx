import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays, Check, Circle, CircleDot, Flag, Link2, ListTodo,
  Milestone, Pencil, Plus, Trash2, X, Columns3, List
} from "lucide-react";
import "./room-project.css";

const TASK_STATUSES = [
  { value: "todo", label: "To do" },
  { value: "in-progress", label: "In progress" },
  { value: "done", label: "Done" }
];

function dateLabel(value) {
  if (!value) return "No due date";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function textForElement(element) {
  const label = element?.text || element?.originalText || "";
  const compact = String(label).replace(/\s+/g, " ").trim();
  return `${element?.type || "Canvas object"}${compact ? ` · ${compact.slice(0, 36)}` : ""}`;
}

function TaskStatus({ status, onClick, readOnly }) {
  const next = status === "todo" ? "in-progress" : status === "in-progress" ? "done" : "todo";
  return (
    <button
      type="button"
      className={`project-status project-status-${status || "todo"}`}
      onClick={onClick}
      disabled={readOnly}
      title={readOnly ? "View-only room" : `Move to ${TASK_STATUSES.find((item) => item.value === next)?.label}`}
    >
      {status === "done" ? <Check size={13} /> : status === "in-progress" ? <CircleDot size={13} /> : <Circle size={13} />}
      {TASK_STATUSES.find((item) => item.value === status)?.label || "To do"}
    </button>
  );
}

export default function RoomProjectPanel({
  items = [], notes = [], elements = [], selectedElementId = null,
  assignees = [], readOnly = false, onClose, onSave, onDelete, onOpenLink,
  roomKind = "board"
}) {
  const [tab, setTab] = useState("tasks");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [taskView, setTaskView] = useState("list");
  const [draggedTaskId, setDraggedTaskId] = useState(null);

  const activeItems = useMemo(() => items.filter((item) => !item.deletedAt), [items]);
  const tasks = activeItems.filter((item) => item.kind !== "milestone");
  const milestones = activeItems.filter((item) => item.kind === "milestone");
  const doneCount = tasks.filter((item) => item.status === "done").length;
  const progress = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  const noteById = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes]);
  const elementById = useMemo(() => new Map(elements.map((element) => [element.id, element])), [elements]);

  useEffect(() => {
    if (!formOpen) return;
    const active = editingId ? activeItems.find((item) => item.id === editingId) : null;
    setDraft(active ? {
      kind: active.kind,
      title: active.title || "",
      description: active.description || "",
      status: active.status || (active.kind === "milestone" ? "upcoming" : "todo"),
      priority: active.priority || "medium",
      dueDate: active.dueDate || "",
      assigneeId: active.assigneeId || "",
      milestoneId: active.milestoneId || "",
      linkedElementId: active.linkedElementId || "",
      linkedNoteId: active.linkedNoteId || ""
    } : {
      kind: tab === "milestones" ? "milestone" : "task",
      title: "",
      description: "",
      status: tab === "milestones" ? "upcoming" : "todo",
      priority: "medium",
      dueDate: "",
      assigneeId: "",
      milestoneId: "",
      linkedElementId: selectedElementId || "",
      linkedNoteId: ""
    });
  }, [formOpen, editingId, activeItems, tab, selectedElementId]);

  const startCreate = () => {
    setEditingId(null);
    setFormOpen(true);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setTab(item.kind === "milestone" ? "milestones" : "tasks");
    setFormOpen(true);
  };

  const updateDraft = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!draft?.title?.trim()) return;
    const selectedAssignee = assignees.find((person) => person.id === draft.assigneeId);
    const existingItem = editingId ? activeItems.find((item) => item.id === editingId) : null;
    await onSave({
      ...(editingId ? { id: editingId } : {}),
      ...draft,
      assigneeId: selectedAssignee?.id || draft.assigneeId || null,
      assigneeName: selectedAssignee?.name || (draft.assigneeId ? existingItem?.assigneeName || null : null),
      dueDate: draft.dueDate || null,
      milestoneId: draft.milestoneId || null,
      linkedElementId: draft.linkedElementId || null,
      linkedNoteId: draft.linkedNoteId || null
    });
    setFormOpen(false);
    setEditingId(null);
  };

  const updateStatus = async (item) => {
    if (readOnly) return;
    const nextStatus = item.status === "todo" ? "in-progress" : item.status === "in-progress" ? "done" : "todo";
    await onSave({ ...item, status: nextStatus });
  };

  const openLink = (item) => {
    if (item.linkedElementId || item.linkedNoteId) onOpenLink?.(item);
  };

  const moveTask = async (task, status) => {
    if (readOnly || !task || task.status === status) return;
    await onSave({ ...task, status });
  };

  const dropTask = async (event, status) => {
    event.preventDefault();
    const task = tasks.find((item) => item.id === draggedTaskId);
    setDraggedTaskId(null);
    await moveTask(task, status);
  };

  return (
    <aside className="room-project-panel" aria-label="Room project management">
      <div className="project-panel-head">
        <div className="project-panel-title-row">
          <div className="project-panel-icon"><ListTodo size={18} /></div>
          <div>
            <p className="project-panel-eyebrow">Room workspace</p>
            <h2>Project</h2>
          </div>
          <button className="project-panel-close" type="button" onClick={onClose} aria-label="Close project panel"><X size={18} /></button>
        </div>
        <p className="project-panel-description">{roomKind === "notes" ? "Turn your notes into clear, assigned next steps." : "Keep the work behind this canvas clear, assigned and moving."}</p>
        <div className="project-progress-card">
          <div className="project-progress-meta"><span>Task progress</span><strong>{progress}%</strong></div>
          <div className="project-progress-track"><span style={{ width: `${progress}%` }} /></div>
          <div className="project-progress-foot"><span>{doneCount} of {tasks.length} tasks complete</span><span>{milestones.length} milestones</span></div>
        </div>
      </div>

      <div className="project-panel-toolbar">
        <div className="project-panel-tabs" role="tablist" aria-label="Project views">
          <button type="button" role="tab" aria-selected={tab === "tasks"} className={tab === "tasks" ? "active" : ""} onClick={() => { setTab("tasks"); setFormOpen(false); }}><ListTodo size={14} /> Tasks <span>{tasks.length}</span></button>
          <button type="button" role="tab" aria-selected={tab === "milestones"} className={tab === "milestones" ? "active" : ""} onClick={() => { setTab("milestones"); setFormOpen(false); }}><Flag size={14} /> Milestones <span>{milestones.length}</span></button>
        </div>
        {tab === "tasks" && <div className="project-view-toggle" role="group" aria-label="Task layout"><button type="button" className={taskView === "list" ? "active" : ""} onClick={() => setTaskView("list")} aria-label="List view"><List size={14} /></button><button type="button" className={taskView === "board" ? "active" : ""} onClick={() => setTaskView("board")} aria-label="Kanban view"><Columns3 size={14} /></button></div>}
        {!readOnly && !formOpen && <button className="project-add-button" type="button" onClick={startCreate}><Plus size={15} /> Add {tab === "tasks" ? "task" : "milestone"}</button>}
      </div>

      {formOpen && draft && (
        <form className="project-item-form" onSubmit={submit}>
          <div className="project-form-topline"><span>{editingId ? "Edit item" : `New ${draft.kind}`}</span><button type="button" onClick={() => setFormOpen(false)} aria-label="Close form"><X size={15} /></button></div>
          <label className="project-field"><span>Title</span><input autoFocus maxLength={120} value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} placeholder={draft.kind === "task" ? "What needs to get done?" : "Name this milestone"} required /></label>
          <label className="project-field"><span>Description</span><textarea rows={2} maxLength={3000} value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} placeholder="Add context or a definition of done…" /></label>
          <div className="project-form-grid">
            {draft.kind === "task" && <label className="project-field"><span>Status</span><select value={draft.status} onChange={(event) => updateDraft("status", event.target.value)}>{TASK_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>}
            {draft.kind === "task" && <label className="project-field"><span>Priority</span><select value={draft.priority} onChange={(event) => updateDraft("priority", event.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>}
            <label className="project-field"><span><CalendarDays size={12} /> Due date</span><input type="date" value={draft.dueDate} onChange={(event) => updateDraft("dueDate", event.target.value)} /></label>
            {draft.kind === "task" && <label className="project-field"><span>Assigned to</span><select value={draft.assigneeId} onChange={(event) => updateDraft("assigneeId", event.target.value)}><option value="">Unassigned</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
            {draft.kind === "task" && <label className="project-field project-field-full"><span>Milestone</span><select value={draft.milestoneId} onChange={(event) => updateDraft("milestoneId", event.target.value)}><option value="">No milestone</option>{milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}</select></label>}
          </div>
          <div className="project-link-fields">
            <div className="project-link-heading"><Link2 size={13} /><span>Connect this work</span></div>
            {roomKind === "notes" ? (
              <label className="project-field"><span>Link to note</span><select value={draft.linkedNoteId} onChange={(event) => updateDraft("linkedNoteId", event.target.value)}><option value="">No note link</option>{notes.map((note) => <option key={note.id} value={note.id}>{note.title || "Untitled note"}</option>)}</select></label>
            ) : (
              <>
                <label className="project-field"><span>Canvas element</span><select value={draft.linkedElementId} onChange={(event) => updateDraft("linkedElementId", event.target.value)}><option value="">No canvas link</option>{elements.filter((element) => !element.isDeleted).map((element) => <option key={element.id} value={element.id}>{textForElement(element)}</option>)}</select></label>
                {selectedElementId && <button className="project-inline-link" type="button" onClick={() => updateDraft("linkedElementId", selectedElementId)}>Use currently selected element</button>}
              </>
            )}
          </div>
          <div className="project-form-actions"><button type="button" className="project-cancel-button" onClick={() => setFormOpen(false)}>Cancel</button><button type="submit" className="project-save-button" disabled={!draft.title.trim()}><Check size={14} /> {editingId ? "Save changes" : `Create ${draft.kind}`}</button></div>
        </form>
      )}

      <div className={`project-items-list ${tab === "tasks" && taskView === "board" ? "is-kanban-list" : ""}`}>
        {tab === "tasks" ? (
          tasks.length ? (taskView === "board" ? (
            <div className="project-kanban-board">
              {TASK_STATUSES.map((status) => {
                const columnTasks = tasks.filter((task) => (task.status || "todo") === status.value);
                return <section className={`project-kanban-column kanban-${status.value}`} key={status.value} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropTask(event, status.value)}>
                  <header><span><i /> {status.label}</span><small>{columnTasks.length}</small></header>
                  <div className="project-kanban-cards">
                    {columnTasks.map((task) => {
                      const linkedNote = task.linkedNoteId ? noteById.get(task.linkedNoteId) : null;
                      const linkedElement = task.linkedElementId ? elementById.get(task.linkedElementId) : null;
                      return <article className="project-kanban-task" key={task.id} draggable={!readOnly} onDragStart={() => setDraggedTaskId(task.id)} onDragEnd={() => setDraggedTaskId(null)}>
                        <div className="kanban-task-meta"><span className={`project-priority priority-${task.priority || "medium"}`}>{task.priority || "medium"}</span>{task.dueDate && <span>{dateLabel(task.dueDate)}</span>}</div>
                        <button type="button" className="kanban-task-title" onClick={() => startEdit(task)} disabled={readOnly}>{task.title}</button>
                        {task.description && <p>{task.description}</p>}
                        <div className="kanban-task-foot">{task.assigneeName && <span className="project-assignee"><span>{task.assigneeName.slice(0, 1).toUpperCase()}</span>{task.assigneeName}</span>}{(task.linkedNoteId || task.linkedElementId) && <button type="button" className="kanban-link-button" onClick={() => openLink(task)} title={linkedNote?.title || (linkedElement ? textForElement(linkedElement) : "Open linked item")}><Link2 size={12} /></button>}</div>
                        {!readOnly && <button type="button" className="kanban-edit-action" onClick={() => startEdit(task)}>Edit task</button>}
                      </article>;
                    })}
                    {!columnTasks.length && <div className="kanban-column-empty">Drop tasks here</div>}
                  </div>
                </section>;
              })}
            </div>
          ) : tasks.map((task) => {
            const linkedNote = task.linkedNoteId ? noteById.get(task.linkedNoteId) : null;
            const linkedElement = task.linkedElementId ? elementById.get(task.linkedElementId) : null;
            const relatedMilestone = task.milestoneId ? milestones.find((milestone) => milestone.id === task.milestoneId) : null;
            return (
              <article className={`project-task-card ${task.status === "done" ? "is-done" : ""}`} key={task.id}>
                <div className="project-task-main">
                  <TaskStatus status={task.status} onClick={() => updateStatus(task)} readOnly={readOnly} />
                  <div className="project-task-copy"><h3>{task.title}</h3>{task.description && <p>{task.description}</p>}</div>
                  {!readOnly && <button className="project-item-edit" type="button" onClick={() => startEdit(task)} aria-label={`Edit ${task.title}`}><Pencil size={14} /></button>}
                </div>
                <div className="project-task-meta">
                  <span className={`project-priority priority-${task.priority || "medium"}`}><Flag size={11} /> {task.priority || "medium"}</span>
                  {task.dueDate && <span><CalendarDays size={11} /> {dateLabel(task.dueDate)}</span>}
                  {task.assigneeName && <span className="project-assignee"><span>{task.assigneeName.slice(0, 1).toUpperCase()}</span>{task.assigneeName}</span>}
                  {relatedMilestone && <span className="project-milestone-chip"><Milestone size={11} />{relatedMilestone.title}</span>}
                </div>
                {(task.linkedNoteId || task.linkedElementId) && <button className="project-linked-reference" type="button" onClick={() => openLink(task)}><Link2 size={12} />{linkedNote ? `Note · ${linkedNote.title}` : linkedElement ? textForElement(linkedElement) : task.linkedNoteId ? "Linked note unavailable" : "Canvas element unavailable"}<span>Open</span></button>}
                {!readOnly && <div className="project-task-actions"><button type="button" onClick={() => startEdit(task)}>Edit details</button><button type="button" className="project-delete-action" onClick={() => setConfirmDelete(task)}><Trash2 size={12} /> Delete</button></div>}
              </article>
            );
          })) : <div className="project-empty-state"><div><ListTodo size={19} /></div><h3>No tasks yet</h3><p>Turn the room’s next steps into assigned, trackable work.</p>{!readOnly && <button type="button" onClick={startCreate}><Plus size={14} /> Add your first task</button>}</div>
        ) : (
          milestones.length ? milestones.map((milestone) => {
            const linkedTasks = tasks.filter((task) => task.milestoneId === milestone.id);
            const completed = linkedTasks.filter((task) => task.status === "done").length;
            const milestoneProgress = linkedTasks.length ? Math.round((completed / linkedTasks.length) * 100) : 0;
            return (
              <article className="project-milestone-card" key={milestone.id}>
                <div className="project-milestone-head"><div className="project-milestone-icon"><Flag size={15} /></div><div className="project-milestone-copy"><h3>{milestone.title}</h3><p>{milestone.dueDate ? `Target · ${dateLabel(milestone.dueDate)}` : "No target date"}</p></div>{!readOnly && <button className="project-item-edit" type="button" onClick={() => startEdit(milestone)} aria-label={`Edit ${milestone.title}`}><Pencil size={14} /></button>}</div>
                {milestone.description && <p className="project-milestone-description">{milestone.description}</p>}
                <div className="project-progress-track milestone-track"><span style={{ width: `${milestoneProgress}%` }} /></div>
                <div className="project-progress-foot"><span>{completed} / {linkedTasks.length} linked tasks complete</span><span>{milestoneProgress}%</span></div>
                {!readOnly && <div className="project-task-actions"><button type="button" onClick={() => startEdit(milestone)}>Edit milestone</button><button type="button" className="project-delete-action" onClick={() => setConfirmDelete(milestone)}><Trash2 size={12} /> Delete</button></div>}
              </article>
            );
          }) : <div className="project-empty-state"><div><Flag size={19} /></div><h3>No milestones yet</h3><p>Set meaningful checkpoints and group tasks around them.</p>{!readOnly && <button type="button" onClick={startCreate}><Plus size={14} /> Add a milestone</button>}</div>
        )}
      </div>

      {confirmDelete && <div className="project-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmDelete(null); }}><div className="project-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="project-delete-title"><h3 id="project-delete-title">Delete this {confirmDelete.kind}?</h3><p>{confirmDelete.kind === "milestone" ? "Tasks linked to this milestone will remain in the room." : "This task will be removed from the room plan."}</p><div><button type="button" onClick={() => setConfirmDelete(null)}>Keep it</button><button type="button" onClick={async () => { await onDelete(confirmDelete.id); setConfirmDelete(null); }}><Trash2 size={13} /> Delete</button></div></div></div>}

      <div className="project-panel-foot"><span className="project-foot-dot" /> {roomKind === "notes" ? "Notes room" : "Board room"} <span>·</span> Project data synced WITH ROOM</div>
    </aside>
  );
}
