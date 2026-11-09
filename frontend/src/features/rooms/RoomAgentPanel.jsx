import { useMemo, useState } from "react";
import {
  ArrowUpRight, Bot, Check, CheckCheck, ChevronDown, ExternalLink,
  LoaderCircle, Plus, Search, ShieldCheck, Sparkles, X
} from "lucide-react";
import { analyzeRoomGoal } from "../../services/agentService.js";
import "./room-agent.css";

const SUGGESTIONS = [
  "Review this idea and identify the biggest gaps before I build it.",
  "Research the best approach and turn it into a practical execution plan.",
  "Find risks, missing requirements and a better architecture for this project."
];

export default function RoomAgentPanel({ room, notes = [], elements = [], projectItems = [], readOnly = false, isAuthenticated = false, onRequireAccount, onSaveTasks, onClose }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [result, setResult] = useState(null);
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [adding, setAdding] = useState(false);
  const [addedCount, setAddedCount] = useState(0);

  const context = useMemo(() => ({
    title: room?.title || "Untitled room",
    kind: room?.kind || "board",
    notes: (notes || []).slice(0, 12).map((note) => ({ title: note.title, content: String(note.content || "").slice(0, 1800) })),
    elements: (elements || []).filter((element) => !element.isDeleted).slice(0, 80).map((element) => ({
      type: element.type,
      text: element.text || element.originalText,
      x: element.x,
      y: element.y
    })),
    tasks: (projectItems || []).filter((item) => !item.deletedAt && item.kind !== "milestone").map((item) => ({ title: item.title, status: item.status })).slice(0, 30)
  }), [room?.title, room?.kind, notes, elements, projectItems]);

  const runAnalysis = async (event) => {
    event?.preventDefault?.();
    if (!prompt.trim() || busy) return;
    if (!isAuthenticated) {
      onRequireAccount?.();
      return;
    }
    setBusy(true);
    setError("");
    setErrorCode("");
    setAddedCount(0);
    try {
      const response = await analyzeRoomGoal(prompt.trim(), context);
      setResult(response);
      setSelectedTasks(response.plan.tasks.map((_, index) => index));
    } catch (cause) {
      setError(cause.message || "The agent couldn't complete this analysis.");
      setErrorCode(cause.code || "");
    } finally {
      setBusy(false);
    }
  };

  const toggleTask = (index) => setSelectedTasks((current) => current.includes(index)
    ? current.filter((item) => item !== index)
    : [...current, index]);

  const addApprovedTasks = async () => {
    if (!result || !selectedTasks.length || adding || readOnly) return;
    setAdding(true);
    let added = 0;
    try {
      for (const index of selectedTasks) {
        const task = result.plan.tasks[index];
        if (!task) continue;
        await onSaveTasks({ kind: "task", title: task.title, description: task.description, priority: task.priority, status: "todo" });
        added += 1;
      }
      setAddedCount(added);
    } catch (cause) {
      setError(cause.message || "Some tasks could not be added to the room.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <aside className="room-agent-panel" aria-label="Arcdraw Agent">
      <header className="agent-panel-head">
        <div className="agent-mark"><Sparkles size={18} /></div>
        <div className="agent-head-copy"><p>Arcdraw intelligence</p><h2>Agent</h2></div>
        <span className="agent-beta-tag">Research</span>
        <button type="button" className="agent-close" onClick={onClose} aria-label="Close agent"><X size={17} /></button>
      </header>

      <div className="agent-context-strip">
        <span className="agent-context-dot" />
        <span>Reading this {room?.kind === "notes" ? "Notes room" : "Board"}</span>
        <span className="agent-context-divider" />
        <span>{context.notes.length} notes</span>
        <span>{context.elements.length} canvas objects</span>
      </div>

      <div className="agent-composer-wrap">
        <div className="agent-intro"><Bot size={18} /><div><strong>What are you trying to figure out?</strong><span>I'll inspect the room, research the problem and find the gaps before recommending next steps.</span></div></div>
        <form className="agent-composer" onSubmit={runAnalysis}>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Describe the idea, problem or outcome you want to achieve…"
            disabled={busy}
          />
          <div className="agent-composer-footer"><span>{prompt.length}/2,000</span><button type="submit" disabled={busy || prompt.trim().length < 8}>{busy ? <><LoaderCircle size={14} className="spin" /> Researching</> : <><Search size={14} /> Analyze goal</>}</button></div>
        </form>
        <p className="agent-privacy-note"><ShieldCheck size={13} /> Your prompt and relevant room context are sent to the configured AI provider. Tavily receives only the search query, not your notes or canvas content.</p>
        {!isAuthenticated && <p className="agent-account-note"><ShieldCheck size={13} /> Sign in to run the research agent. Your room stays local until you choose to sync it.</p>}
        <div className="agent-suggestion-list"><span>Try asking</span>{SUGGESTIONS.map((suggestion) => <button type="button" key={suggestion} onClick={() => setPrompt(suggestion)} disabled={busy}>{suggestion}<ArrowUpRight size={12} /></button>)}</div>
      </div>

      {error && <div className="agent-error-state" role="alert"><strong>Agent couldn't finish</strong><span>{error}</span>{errorCode === "AGENT_NOT_CONFIGURED" && <small>Agent needs a server AI provider key (AI_API_KEY in backend/.env). Web research also requires TAVILY_API_KEY.</small>}{(errorCode === "AUTH_REQUIRED" || errorCode === "ACCESS_TOKEN_INVALID") && <small>Please sign in to use the agent.</small>}</div>}

      {result && (
        <div className="agent-results">
          <div className="agent-result-title"><div><span>Analysis complete</span><h3>Your next move</h3></div><button type="button" onClick={() => { setResult(null); setError(""); }} title="Clear results"><X size={15} /></button></div>
          <section className="agent-summary-card"><span>Overview</span><p>{result.plan.summary}</p></section>

          {!!result.plan.gapAnalysis.length && <section className="agent-result-section"><div className="agent-section-title"><h4>What’s missing</h4><span>{result.plan.gapAnalysis.length} gaps found</span></div><div className="agent-gap-list">{result.plan.gapAnalysis.map((gap, index) => <article className="agent-gap-card" key={`${gap.title}-${index}`}><div className={`agent-impact impact-${gap.impact}`}><span /></div><div><strong>{gap.title}</strong><p>{gap.detail}</p></div><small>{gap.impact}</small></article>)}</div></section>}

          <section className="agent-result-section"><div className="agent-section-title"><h4>Recommended approach</h4></div><div className="agent-approach-card">{result.plan.recommendedApproach}</div></section>

          {!!result.plan.executionSteps.length && <section className="agent-result-section"><div className="agent-section-title"><h4>Execution path</h4><span>{result.plan.executionSteps.length} steps</span></div><ol className="agent-execution-list">{result.plan.executionSteps.map((step, index) => <li key={`${step}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>)}</ol></section>}

          {!!result.plan.tasks.length && <section className="agent-result-section"><div className="agent-section-title"><div><h4>Proposed tasks</h4><span>Review before adding them to Project.</span></div><button className="agent-select-toggle" type="button" onClick={() => setSelectedTasks(selectedTasks.length === result.plan.tasks.length ? [] : result.plan.tasks.map((_, index) => index))}>{selectedTasks.length === result.plan.tasks.length ? "Clear" : "Select all"}</button></div><div className="agent-proposed-tasks">{result.plan.tasks.map((task, index) => <label className="agent-proposed-task" key={`${task.title}-${index}`}><input type="checkbox" checked={selectedTasks.includes(index)} onChange={() => toggleTask(index)} /><span className="agent-task-check"><Check size={11} /></span><span className="agent-task-content"><strong>{task.title}</strong>{task.description && <small>{task.description}</small>}</span><em className={`priority-${task.priority}`}>{task.priority}</em></label>)}</div>{!readOnly && <button className="agent-approve-button" type="button" onClick={addApprovedTasks} disabled={!selectedTasks.length || adding || addedCount > 0}>{adding ? <><LoaderCircle size={14} className="spin" /> Adding approved tasks</> : addedCount ? <><CheckCheck size={15} /> {addedCount} tasks added to Project</> : <><Plus size={14} /> Add {selectedTasks.length} approved tasks to Project</>}</button>}</section>}

          {!!result.plan.cautions.length && <section className="agent-result-section agent-cautions"><div className="agent-section-title"><h4>Risks to keep in mind</h4></div>{result.plan.cautions.map((item, index) => <p key={`${item}-${index}`}>{item}</p>)}</section>}

          <section className="agent-sources"><div><span>Research sources</span><strong>{result.research.searched ? `${result.research.sources.length} sources from Tavily` : result.research.configured ? "AI plan · Search unavailable" : "AI plan · Web search not configured"}</strong></div>{result.research.sources.map((source) => <a href={source.url} key={source.url} target="_blank" rel="noopener noreferrer"><span><strong>{source.title}</strong>{source.content && <small>{source.content}</small>}</span><ExternalLink size={12} /></a>)}{!result.research.searched && <small>{result.research.error || "Add TAVILY_API_KEY to the server environment to enable external research."}</small>}</section>
          <p className="agent-approval-note"><ShieldCheck size={12} /> The agent only proposes. It won't modify your canvas, notes or tasks unless you approve the proposed tasks.</p>
        </div>
      )}
    </aside>
  );
}
