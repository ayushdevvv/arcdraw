import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, Check, LayoutDashboard, LoaderCircle, LogIn, Presentation, RotateCcw, Smartphone, Sparkles, StickyNote, Wand2, X } from "lucide-react";
import { generateRoomDesign } from "../../services/agentService.js";
import "./room-agent.css";

const IDEAS = [
  { id: "dash", label: "Dashboard", icon: LayoutDashboard, prompt: "Design a premium dark SaaS analytics dashboard with a clear sidebar, revenue chart and recent activity." },
  { id: "mobile", label: "Mobile app", icon: Smartphone, prompt: "Create a polished fintech mobile app screen with a balance card, spending chart and transaction list." },
  { id: "landing", label: "Landing page", icon: Presentation, prompt: "Build a clean product landing page with a bold hero, feature grid, product preview and pricing section." },
  { id: "board", label: "Brainstorm", icon: StickyNote, prompt: "Create a visual brainstorm board with grouped sticky notes, priorities and connecting arrows." }
];

const STAGES = [
  { id: "understanding", label: "Reading the brief" },
  { id: "composing", label: "Composing layout" },
  { id: "reviewing", label: "Checking quality" },
  { id: "refining", label: "Polishing" },
  { id: "ready", label: "Ready" }
];

// Eases the shown percentage toward the real one and creeps a little so it never looks frozen.
function useSmoothProgress(target, active) {
  const [value, setValue] = useState(0);
  useEffect(function () {
    if (!active) {
      setValue(0);
      return undefined;
    }
    const id = window.setInterval(function () {
      setValue(function (current) {
        const goal = Math.max(target, 4);
        if (current < goal) return Math.min(goal, current + Math.max(0.5, (goal - current) * 0.14));
        const cap = goal >= 100 ? 100 : Math.min(goal + 6, 96);
        return current < cap ? current + 0.05 : current;
      });
    }, 60);
    return function () { window.clearInterval(id); };
  }, [target, active]);
  return Math.min(100, Math.round(value));
}

function previewStyle(element, canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const style = {
    left: Math.max(0, Math.min(100, (element.x / w) * 100)) + "%",
    top: Math.max(0, Math.min(100, (element.y / h) * 100)) + "%",
    width: Math.max(0.2, Math.min(100, (element.width / w) * 100)) + "%",
    height: Math.max(0.2, Math.min(100, (element.height / h) * 100)) + "%",
    opacity: (element.opacity == null ? 100 : element.opacity) / 100
  };
  if (element.type === "line" || element.type === "arrow") {
    const horizontal = element.width >= element.height;
    const color = element.strokeColor && element.strokeColor !== "transparent" ? element.strokeColor : (element.fillColor || "#888");
    style.background = color;
    if (horizontal) {
      style.height = Math.max(0.25, (2 / w) * 100 * 1.6) + "cqw";
      style.top = Math.max(0, Math.min(100, ((element.y + element.height / 2) / h) * 100)) + "%";
    } else {
      style.width = Math.max(0.25, (2 / w) * 100 * 1.6) + "cqw";
      style.left = Math.max(0, Math.min(100, ((element.x + element.width / 2) / w) * 100)) + "%";
    }
    return style;
  }
  const isText = element.type === "text";
  style.background = isText ? "transparent" : element.fillColor;
  style.borderColor = element.strokeColor === "transparent" ? "transparent" : element.strokeColor;
  style.borderRadius = element.type === "ellipse" ? "50%" : ((element.radius || 0) / w) * 100 + "cqw";
  style.color = element.textColor;
  style.fontSize = Math.max(0.9, (element.fontSize / w) * 100) + "cqw";
  style.textAlign = element.textAlign;
  return style;
}

function editFields(edit) {
  return [
    edit.text !== null ? "Copy" : null,
    edit.fillColor ? "Fill" : null,
    edit.strokeColor ? "Stroke" : null,
    edit.textColor ? "Text color" : null,
    edit.fontSize !== null ? "Type size" : null,
    edit.x !== null || edit.y !== null ? "Position" : null,
    edit.width !== null || edit.height !== null ? "Size" : null,
    edit.opacity !== null ? "Opacity" : null,
    edit.radius !== null ? "Corners" : null
  ].filter(Boolean);
}

function SkeletonBuild() {
  return (
    <div className="ag-skeleton" aria-hidden="true">
      <span className="ag-sk ag-sk-side" />
      <span className="ag-sk ag-sk-top" />
      <span className="ag-sk ag-sk-t1" />
      <span className="ag-sk ag-sk-s1" />
      <span className="ag-sk ag-sk-s2" />
      <span className="ag-sk ag-sk-s3" />
      <span className="ag-sk ag-sk-chart" />
      <span className="ag-sk ag-sk-r1" />
      <span className="ag-sk ag-sk-r2" />
      <span className="ag-sk ag-sk-r3" />
      <span className="ag-scan" />
    </div>
  );
}

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
  const textareaRef = useRef(null);

  const selectedSet = useMemo(function () { return new Set(selectedElementIds || []); }, [selectedElementIds]);
  const context = useMemo(function () {
    const live = (elements || []).filter(function (element) { return !element.isDeleted; });
    return {
      title: room?.title || "Untitled room",
      kind: room?.kind || "board",
      elementCount: live.length,
      selected: (elements || []).filter(function (element) { return selectedSet.has(element.id); }).slice(0, 12).map(function (element) {
        return {
          id: element.id, type: element.type, text: element.text || element.originalText || "",
          backgroundColor: element.backgroundColor, strokeColor: element.strokeColor, fontSize: element.fontSize,
          opacity: element.opacity, x: element.x, y: element.y, width: element.width, height: element.height
        };
      })
    };
  }, [room?.title, room?.kind, elements, selectedSet]);

  const isNotesRoom = room?.kind === "notes";
  const shownPercent = useSmoothProgress(progress.progress || 0, busy);
  const activeStageIndex = Math.max(0, STAGES.findIndex(function (item) { return item.id === progress.stage; }));

  useEffect(function () { return function () { controllerRef.current?.abort(); }; }, []);

  useEffect(function () {
    function onKey(event) { if (event.key === "Escape") onClose?.(); }
    window.addEventListener("keydown", onKey);
    return function () { window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  async function runDesign(event) {
    event?.preventDefault?.();
    if (prompt.trim().length < 8 || busy) return;
    if (!isAuthenticated) { onRequireAccount?.(); return; }
    if (isNotesRoom) {
      setError("Open a Board room to generate designs.");
      setErrorCode("BOARD_ROOM_REQUIRED");
      return;
    }
    setBusy(true);
    setError("");
    setErrorCode("");
    setDesign(null);
    setApplied(false);
    setProgress({ stage: "queued", title: "Getting started", detail: "", progress: 4 });
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const response = await generateRoomDesign(prompt.trim(), context, { signal: controller.signal, onProgress: setProgress });
      setDesign(response.design);
      setProgress({ stage: "ready", title: "Ready", detail: "", progress: 100 });
    } catch (cause) {
      if (cause.code !== "AGENT_CANCELLED" && cause.name !== "AbortError") {
        setError(cause.message || "The Design Agent couldn't finish this design.");
        setErrorCode(cause.code || "");
      }
    } finally {
      setBusy(false);
      controllerRef.current = null;
    }
  }

  function cancelGeneration() { controllerRef.current?.abort(); }

  function applyDesign() {
    if (!design || readOnly || applied) return;
    const result = onApplyDesign?.(design);
    if (result !== false) setApplied(true);
  }

  function discardDesign() {
    setDesign(null);
    setApplied(false);
    textareaRef.current?.focus();
  }

  function handleSignIn() { onRequireAccount?.(); }
  function onPrompt(event) { setPrompt(event.target.value); }
  function onPromptKey(event) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") runDesign(event);
  }
  function pickIdea(idea) {
    return function () {
      setPrompt(idea.prompt);
      textareaRef.current?.focus();
    };
  }

  function renderStage() {
    if (busy) {
      return (
        <div className="ag-loading" aria-live="polite">
          <div className="ag-frame"><SkeletonBuild /></div>
          <div className="ag-loadmeta">
            <strong className="ag-percent">{shownPercent}<small>%</small></strong>
            <div className="ag-loadtext">
              <b>{progress.title || "Designing"}</b>
              <span>{STAGES[activeStageIndex]?.label || "Working"}</span>
            </div>
          </div>
          <div className="ag-bar-track"><span style={{ width: shownPercent + "%" }} /></div>
        </div>
      );
    }
    if (design && design.mode === "update-selection") {
      return (
        <div className="ag-result">
          <div className="ag-edits">
            {design.edits.map(function (edit) {
              return (
                <div className="ag-edit" key={edit.targetId}>
                  <strong>{edit.name}</strong>
                  <div>{editFields(edit).map(function (field) { return <span key={field}>{field}</span>; })}</div>
                </div>
              );
            })}
          </div>
          {renderResultBar(design.edits.length + (design.edits.length === 1 ? " edit" : " edits"))}
        </div>
      );
    }
    if (design) {
      const canvas = design.canvas;
      return (
        <div className="ag-result">
          <div className="ag-frame is-done">
            <div className="ag-canvas" style={{ background: canvas.backgroundColor, aspectRatio: canvas.width + " / " + canvas.height }}>
              {design.elements.slice(0, 160).map(function (element, index) {
                const label = element.type === "text" || element.type === "sticky" ? element.text : "";
                const style = previewStyle(element, canvas);
                style.animationDelay = Math.min(index * 14, 700) + "ms";
                return <span className={"ag-el type-" + element.type} style={style} key={element.name + "-" + index}>{label}</span>;
              })}
            </div>
          </div>
          {renderResultBar(design.elements.length + " objects  " + canvas.width + " x " + canvas.height)}
        </div>
      );
    }
    return (
      <div className="ag-empty">
        <div className="ag-frame is-idle"><SkeletonBuild /></div>
        <p>Your design appears here</p>
      </div>
    );
  }

  function renderResultBar(summary) {
    return (
      <div className="ag-resultbar">
        <div className="ag-resultinfo">
          <strong>{design.title}</strong>
          <span>{summary}{design.qualityWarnings?.length ? "  Review layout" : ""}</span>
        </div>
        <button className="ag-icon" type="button" onClick={discardDesign} aria-label="Discard and try again" title="Discard"><RotateCcw size={16} /></button>
        {applied
          ? <button className="ag-apply is-done" type="button" onClick={onClose}><Check size={16} /> Added. Close</button>
          : <button className="ag-apply" type="button" onClick={applyDesign} disabled={readOnly}><Check size={16} /> {design.mode === "update-selection" ? "Apply edits" : "Add to canvas"}</button>}
      </div>
    );
  }

  const canGenerate = prompt.trim().length >= 8 && !readOnly && !isNotesRoom;

  const node = (
    <div className="ag-overlay" role="dialog" aria-modal="true" aria-label="Design Agent">
      <div className="ag-sheet">
        <header className="ag-head">
          <span className="ag-mark"><Sparkles size={17} /></span>
          <h2>Design Agent</h2>
          <span className="ag-chip">{isNotesRoom ? "Notes" : "Board"}  {context.elementCount} objects{context.selected.length ? "  " + context.selected.length + " selected" : ""}</span>
          {!isAuthenticated && <button className="ag-signin" type="button" onClick={handleSignIn}><LogIn size={14} /> Sign in</button>}
          <button className="ag-close" type="button" onClick={onClose} aria-label="Close Design Agent"><X size={18} /></button>
        </header>

        <div className="ag-split">
          <section className="ag-stage" aria-label="Preview">{renderStage()}</section>

          <section className="ag-prompt" aria-label="Prompt">
            <label className="ag-label" htmlFor="ag-prompt-input">Describe your design</label>
            <div className="ag-composer">
              <textarea
                id="ag-prompt-input"
                ref={textareaRef}
                value={prompt}
                onChange={onPrompt}
                onKeyDown={onPromptKey}
                maxLength={2000}
                disabled={busy}
                placeholder={context.selected.length ? "Describe a new design or how to change the selection" : "A dark analytics dashboard with bold type and green accents"}
              />
              <div className="ag-composer-foot">
                <span>{prompt.length} / 2000</span>
                {busy
                  ? <button className="ag-go is-cancel" type="button" onClick={cancelGeneration}><X size={15} /> Cancel</button>
                  : <button className="ag-go" type="button" onClick={runDesign} disabled={!canGenerate}><Wand2 size={15} /> Generate <ArrowUp size={14} /></button>}
              </div>
            </div>

            {busy && (
              <ol className="ag-steps" aria-label="Progress">
                {STAGES.map(function (stage, index) {
                  const done = progress.stage === "ready" || index < activeStageIndex;
                  const active = index === activeStageIndex;
                  return (
                    <li key={stage.id} className={(done ? "is-done " : "") + (active ? "is-active" : "")}>
                      <i>{done ? <Check size={11} /> : active ? <LoaderCircle size={11} className="ag-rot" /> : null}</i>
                      <span>{stage.label}</span>
                    </li>
                  );
                })}
              </ol>
            )}

            {!busy && !design && (
              <div className="ag-ideas">
                <span className="ag-label">Quick start</span>
                <div>
                  {IDEAS.map(function (idea) {
                    const Icon = idea.icon;
                    return <button type="button" key={idea.id} onClick={pickIdea(idea)}><Icon size={15} /> {idea.label}</button>;
                  })}
                </div>
              </div>
            )}

            {error && (
              <div className="ag-error" role="alert">
                <strong>Couldn't finish</strong>
                <span>{error}</span>
                {errorCode === "AUTH_REQUIRED" || /sign in again/i.test(error) ? <button className="ag-signin ag-signin-inline" type="button" onClick={handleSignIn}><LogIn size={14} /> Sign in</button> : null}
                {errorCode === "AGENT_NOT_CONFIGURED" && <small>Add AI_API_KEY to the backend and redeploy.</small>}
              </div>
            )}
            {isNotesRoom && !error && <p className="ag-hint">Switch to a Board room to generate designs.</p>}
            {!isAuthenticated && !error && <p className="ag-hint">Sign in to generate. Your room stays on this device.</p>}
          </section>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
