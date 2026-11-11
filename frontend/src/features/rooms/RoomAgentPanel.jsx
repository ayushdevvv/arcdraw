import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight, Check, CheckCircle2, Circle, Command, Layers3,
  LoaderCircle, Palette, Plus, RotateCcw, ShieldCheck, Sparkles, WandSparkles, X
} from "lucide-react";
import { generateRoomDesign } from "../../services/agentService.js";
import "./room-agent.css";

const SUGGESTIONS = [
  "Design a premium dark SaaS analytics dashboard with a clear sidebar, revenue chart and recent activity.",
  "Create a polished fintech mobile app screen with a balance card, spending chart and transaction list.",
  "Build a clean product landing page with a bold hero, feature grid, product preview and pricing section.",
  "Create a visual brainstorm board with grouped sticky notes, priorities and connecting arrows."
];

const STAGES = [
  { id: "understanding", label: "Understanding the brief", detail: "Reading your direction and room context" },
  { id: "composing", label: "Composing the design", detail: "Building layout, type scale and components" },
  { id: "reviewing", label: "Checking visual quality", detail: "Validating geometry and hierarchy" },
  { id: "refining", label: "Polishing the result", detail: "Making final corrections" },
  { id: "ready", label: "Ready for your canvas", detail: "Preparing editable objects" }
];

export default function RoomAgentPanel({
  room, elements = [], selectedElementIds = [], readOnly = false, isAuthenticated = false,
  onRequireAccount, onApplyDesign, onClose
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [design, setDesign] = useState(null);
  const [progress, setProgress] = useState({ stage: "", title: "", detail: "", progress: 0 });
  const [applied, setApplied] = useState(false);
  const controllerRef = useRef(null);

  const selectedSet = useMemo(() => new Set(selectedElementIds || []), [selectedElementIds]);
  const context = useMemo(() => ({
    title: room?.title || "Untitled room",
    kind: room?.kind || "board",
    elementCount: (elements || []).filter((element) => !element.isDeleted).length,
    selected: (elements || []).filter((element) => selectedSet.has(element.id)).slice(0, 12).map((element) => ({
      id: element.id,
      type: element.type,
      text: element.text || element.originalText || "",
      backgroundColor: element.backgroundColor,
      strokeColor: element.strokeColor,
      fontSize: element.fontSize,
      opacity: element.opacity,
      x: element.x, y: element.y, width: element.width, height: element.height
    }))
  }), [room?.title, room?.kind, elements, selectedSet]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const runDesign = async (event) => {
    event?.preventDefault?.();
    if (prompt.trim().length < 8 || busy) return;
    if (!isAuthenticated) { onRequireAccount?.(); return; }
    if (room?.kind === "notes") {
      setError("Open a Board room to generate editable canvas designs. Your Notes room remains unchanged.");
      setErrorCode("BOARD_ROOM_REQUIRED");
      return;
    }
    setBusy(true);
    setError("");
    setErrorCode("");
    setDesign(null);
    setApplied(false);
    setProgress({ stage: "queued", title: "Warming up the design studio", detail: "Preparing your room context.", progress: 4 });
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const response = await generateRoomDesign(prompt.trim(), context, {
        signal: controller.signal,
        onProgress: setProgress
      });
      setDesign(response.design);
      setApplied(false);
      const readyCount = response.design.mode === "update-selection" ? response.design.edits.length : response.design.elements.length;
      setProgress({ stage: "ready", title: "Your design is ready", detail: `${readyCount} ${response.design.mode === "update-selection" ? "selected changes" : "editable objects"} prepared.`, progress: 100 });
    } catch (cause) {
      if (cause.code !== "AGENT_CANCELLED" && cause.name !== "AbortError") {
        setError(cause.message || "The Design Agent couldn't finish this design.");
        setErrorCode(cause.code || "");
      }
    } finally {
      setBusy(false);
      controllerRef.current = null;
    }
  };

  const cancelGeneration = () => {
    controllerRef.current?.abort();
  };

  const applyDesign = () => {
    if (!design || readOnly || applied) return;
    const result = onApplyDesign?.(design);
    if (result !== false) setApplied(true);
  };

  const editFields = (edit) => [
    edit.text !== null ? "Copy" : null,
    edit.fillColor ? "Fill" : null,
    edit.strokeColor ? "Stroke" : null,
    edit.textColor ? "Text color" : null,
    edit.fontSize !== null ? "Type size" : null,
    edit.x !== null || edit.y !== null ? "Position" : null,
    edit.width !== null || edit.height !== null ? "Dimensions" : null,
    edit.opacity !== null ? "Opacity" : null,
    edit.radius !== null ? "Corners" : null
  ].filter(Boolean);

  const activeStageIndex = Math.max(0, STAGES.findIndex((item) => item.id === progress.stage));
  const isNotesRoom = room?.kind === "notes";

  return (
    <aside className="room-agent-panel" aria-label="ArcDraw Design Agent">
      <header className="agent-panel-head">
        <div className="agent-mark"><Sparkles size={19} /></div>
        <div className="agent-head-copy"><p>ARCDRAW INTELLIGENCE</p><h2>Design Agent</h2></div>
        <span className="agent-beta-tag">STUDIO</span>
        <button type="button" className="agent-close" onClick={onClose} aria-label="Close Design Agent"><X size={17} /></button>
      </header>

      <div className="agent-context-strip">
        <span className="agent-context-dot" />
        <span>{isNotesRoom ? "Notes room" : "Board room"}</span>
        <span className="agent-context-divider" />
        <span>{context.elementCount} objects</span>
        {context.selected.length > 0 && <span>{context.selected.length} selected</span>}
      </div>

      <div className="agent-composer-wrap">
        <div className="agent-intro">
          <div className="agent-intro-icon"><WandSparkles size={18} /></div>
          <div>
            <strong>Imagine it. I'll build it.</strong>
            <span>Describe the screen, flow or visual you have in mind. Get an editable composition on your canvas, not a flat image.</span>
          </div>
        </div>
        <form className="agent-composer" onSubmit={runDesign}>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={5}
            maxLength={2000}
            placeholder={context.selected.length ? "Describe a new design, or say how to refine the selected objects…" : "A premium analytics dashboard for a climate-tech startup. Deep ink background, crisp typography, atmospheric green accents…"}
            disabled={busy}
          />
          <div className="agent-composer-footer">
            <span>{prompt.length.toLocaleString()}/2,000</span>
            <button type="submit" disabled={busy || prompt.trim().length < 8 || readOnly || isNotesRoom}>
              {busy ? <><LoaderCircle size={15} className="spin" /> Creating</> : <><Sparkles size={15} /> Generate design</>}
            </button>
          </div>
        </form>
        <div className="agent-capability-row">
          <span><Layers3 size={12} /> Editable layers</span>
          <span><Palette size={12} /> Design system</span>
          <span><Command size={12} /> Room synced</span>
        </div>
        <p className="agent-privacy-note"><ShieldCheck size={13} /> Your prompt and selected object details are sent to the configured Groq model. The API key stays on the server. Generated elements are previewed before they are added.</p>
        {!isAuthenticated && <p className="agent-account-note"><ShieldCheck size={13} /> Sign in to generate designs. Your local room stays on this device until you sync it.</p>}
        {isNotesRoom && <p className="agent-account-note">Design generation is available in Board rooms. Switch to a Board room to place editable canvas elements.</p>}
        {!design && !busy && <div className="agent-suggestion-list"><span>START WITH A DIRECTION</span>{SUGGESTIONS.map((suggestion) => <button type="button" key={suggestion} onClick={() => setPrompt(suggestion)}>{suggestion}<ArrowUpRight size={13} /></button>)}</div>}
      </div>

      {busy && (
        <div className="agent-progress-card" aria-live="polite">
          <div className="agent-progress-top"><span className="agent-live-indicator" /> <span>DESIGNING YOUR CANVAS</span><strong>{Math.max(4, progress.progress || 4)}%</strong><button type="button" className="agent-cancel-button" onClick={cancelGeneration}>Cancel</button></div>
          <div className="agent-progress-track"><span style={{ width: `${Math.max(4, Math.min(100, progress.progress || 4))}%` }} /></div>
          <div className="agent-progress-heading"><div className="agent-progress-orb"><Sparkles size={17} /></div><div><strong>{progress.title || "Working on your design"}</strong><span>{progress.detail || "The agent is preparing the composition."}</span></div></div>
          <div className="agent-stage-list">{STAGES.map((stage, index) => {
            const complete = progress.stage === "ready" || index < activeStageIndex;
            const active = stage.id === progress.stage || (progress.stage === "queued" && index === 0);
            return <div className={`agent-stage ${complete ? "is-complete" : ""} ${active ? "is-active" : ""}`} key={stage.id}>{complete ? <CheckCircle2 size={15} /> : active ? <LoaderCircle size={15} className="spin" /> : <Circle size={15} />}<span>{stage.label}</span></div>;
          })}</div>
        </div>
      )}

      {error && <div className="agent-error-state" role="alert"><strong>Couldn't complete this design</strong><span>{error}</span>{errorCode === "AGENT_NOT_CONFIGURED" && <small>Add AI_API_KEY to the backend environment and redeploy.</small>}{(errorCode === "AUTH_REQUIRED" || errorCode === "ACCESS_TOKEN_INVALID") && <small>Please sign in to use the Design Agent.</small>}</div>}

      {design && !busy && (
        <div className="agent-results">
          <div className="agent-result-title"><div><span>DESIGN PREVIEW</span><h3>{design.title}</h3></div><button type="button" onClick={() => { setDesign(null); setApplied(false); }} title="Clear preview"><X size={15} /></button></div>
          <p className="agent-design-description">{design.description}</p>
          <div className="agent-design-stats">
            <div><strong>{design.mode === "update-selection" ? design.edits.length : design.elements.length}</strong><span>{design.mode === "update-selection" ? "Selected edits" : "Editable objects"}</span></div>
            <div><strong>{design.mode === "update-selection" ? context.selected.length : `${design.canvas.width} × ${design.canvas.height}`}</strong><span>{design.mode === "update-selection" ? "Selected objects" : "Canvas size"}</span></div>
            <div><strong>{design.qualityScore || 0}</strong><span>Quality check</span></div>
          </div>
          {design.mode === "update-selection" ? (
            <div className="agent-edit-preview" aria-label="Selected object changes">
              <div className="agent-edit-preview-head"><span><CheckCircle2 size={14} /> CHANGE PREVIEW</span><small>{design.edits.length} object{design.edits.length === 1 ? "" : "s"}</small></div>
              {design.edits.map((edit) => <div className="agent-edit-preview-item" key={edit.targetId}>
                <div><strong>{edit.name}</strong><small>Selected object · {edit.targetId.slice(0, 8)}</small></div>
                <div className="agent-component-chips">{editFields(edit).map((field) => <span key={field}>{field}</span>)}</div>
              </div>)}
            </div>
          ) : <div className="agent-design-preview" aria-label="Generated design preview">
            <div className="agent-preview-canvas" style={{ background: design.canvas.backgroundColor, aspectRatio: `${design.canvas.width} / ${design.canvas.height}` }}>
              {design.elements.slice(0, 42).map((element, index) => {
                const style = {
                  left: `${Math.max(0, Math.min(100, (element.x / design.canvas.width) * 100))}%`,
                  top: `${Math.max(0, Math.min(100, (element.y / design.canvas.height) * 100))}%`,
                  width: `${Math.max(0.8, Math.min(100, (element.width / design.canvas.width) * 100))}%`,
                  height: `${Math.max(0.8, Math.min(100, (element.height / design.canvas.height) * 100))}%`,
                  background: element.type === "text" || element.type === "line" || element.type === "arrow" ? "transparent" : element.fillColor,
                  borderColor: element.strokeColor === "transparent" ? "transparent" : element.strokeColor,
                  borderRadius: element.radius,
                  color: element.textColor,
                  fontSize: `${Math.max(5, element.fontSize * (360 / design.canvas.width))}px`,
                  textAlign: element.textAlign,
                  opacity: element.opacity / 100
                };
                if (element.type === "ellipse") style.borderRadius = "50%";
                return <span className={`agent-preview-element type-${element.type}`} style={style} key={`${element.name}-${index}`}>{element.type === "text" || element.type === "sticky" ? element.text : ""}</span>;
              })}
            </div>
          </div>}
          {!!design.designNotes?.length && <section className="agent-result-section"><div className="agent-section-title"><h4>Design decisions</h4></div><ul className="agent-design-notes">{design.designNotes.map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}</ul></section>}
          {!!design.componentsUsed?.length && <div className="agent-component-chips">{design.componentsUsed.map((item) => <span key={item}>{item}</span>)}</div>}
          {!!design.componentDefinitions?.length && <p className="agent-library-note"><Layers3 size={13} /> {design.componentDefinitions.length} reusable component {design.componentDefinitions.length === 1 ? "master" : "masters"} will be added to this room's Design Studio library.</p>}
          {!!design.qualityWarnings?.length && <p className="agent-quality-note">A few layout checks need your review: {design.qualityWarnings.join(" ")}</p>}
          <div className="agent-apply-row">
            <button type="button" className="agent-apply-button" onClick={applyDesign} disabled={readOnly || applied}>
              {applied ? <><Check size={16} /> Changes applied</> : design.mode === "update-selection" ? <><Check size={16} /> Apply {design.edits.length} selected edits</> : <><Plus size={16} /> Add editable design to canvas</>}
            </button>
            <button type="button" className="agent-regenerate-button" onClick={() => { setDesign(null); setApplied(false); setPrompt((value) => value.trim()); }} title="Create another version"><RotateCcw size={16} /></button>
          </div>
          <p className="agent-approval-note"><ShieldCheck size={13} /> Nothing changes until you approve this preview. {design.mode === "update-selection" ? "Only the selected objects shown above will be updated." : "The new editable objects save locally and synchronize with room collaborators."}</p>
        </div>
      )}
    </aside>
  );
}
