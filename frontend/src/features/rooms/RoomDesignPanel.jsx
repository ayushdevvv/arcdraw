import { useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, Box, Check, ChevronDown, Eye, EyeOff, Frame, Pencil,
  Layers3, LayoutGrid, Lock, LockOpen, Monitor, PackagePlus, Plus,
  Presentation, Smartphone, Tablet, Trash2, WandSparkles, X
} from "lucide-react";
import "./room-design.css";

const FRAME_PRESETS = [
  { id: "desktop", label: "Desktop", size: "1440 × 900", icon: Monitor },
  { id: "tablet", label: "Tablet", size: "834 × 1112", icon: Tablet },
  { id: "mobile", label: "Mobile", size: "390 × 844", icon: Smartphone },
  { id: "presentation", label: "Presentation", size: "1600 × 900", icon: Presentation }
];

function layerName(element, index) {
  const content = String(element.text || element.originalText || element.customData?.frameName || "").replace(/\s+/g, " ").trim();
  return content ? content.slice(0, 34) : `${element.type || "Layer"} ${index + 1}`;
}

export default function RoomDesignPanel({
  elements = [], selectedElementIds = [], designStudio = { tokens: [], components: [] },
  readOnly = false, onClose, onCreateFrame, onSaveComponent, onSaveVariant,
  onInsertComponent, onSaveStudio, onApplyToken, onAutoLayout,
  onSelectElement, onUpdateElements, onMoveLayer, onRenameFrame, onDeleteFrame, onPresent
}) {
  const [tab, setTab] = useState("layers");
  const [tokenName, setTokenName] = useState("");
  const [tokenValue, setTokenValue] = useState("#7c9b83");
  const [componentName, setComponentName] = useState("");
  const [selectedComponentId, setSelectedComponentId] = useState("");
  const [renamingFrameId, setRenamingFrameId] = useState("");
  const [frameDraft, setFrameDraft] = useState("");
  const [layoutGap, setLayoutGap] = useState(24);

  const visibleElements = useMemo(() => [...elements].filter((element) => !element.customData?.arcdrawFrame).reverse(), [elements]);
  const frames = useMemo(() => [...elements].filter((element) => element.customData?.arcdrawFrame && !element.isDeleted).reverse(), [elements]);
  const selectedCount = selectedElementIds.length;
  const components = designStudio?.components || [];
  const tokens = designStudio?.tokens || [];

  const updateLayer = (id, patch) => {
    if (readOnly) return;
    const next = elements.map((element) => element.id === id
      ? { ...element, ...patch, version: (element.version || 0) + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() }
      : element);
    onUpdateElements(next);
  };

  const createToken = async (event) => {
    event.preventDefault();
    const name = tokenName.trim();
    if (!name) return;
    if (tokens.some((token) => token.name.toLowerCase() === name.toLowerCase())) return;
    await onSaveStudio({ ...designStudio, tokens: [...tokens, { id: globalThis.crypto?.randomUUID?.() || `token-${Date.now()}`, name, value: tokenValue, type: "color" }] });
    setTokenName("");
  };

  const beginFrameRename = (frame) => {
    setRenamingFrameId(frame.id);
    setFrameDraft(frame.customData?.frameName || "Untitled frame");
  };

  const submitFrameRename = (event, frame) => {
    event.preventDefault();
    const cleanName = frameDraft.trim().slice(0, 80);
    if (!cleanName) return;
    onRenameFrame?.(frame, cleanName);
    setRenamingFrameId("");
  };

  const saveComponent = async (event) => {
    event.preventDefault();
    if (!componentName.trim()) return;
    await onSaveComponent(componentName.trim());
    setComponentName("");
  };

  const deleteToken = async (tokenId) => onSaveStudio({ ...designStudio, tokens: tokens.filter((token) => token.id !== tokenId) });
  const deleteComponent = async (componentId) => onSaveStudio({ ...designStudio, components: components.filter((item) => item.id !== componentId) });

  return (
    <aside className="room-design-panel" aria-label="Advanced Design Studio">
      <header className="design-panel-head">
        <div className="design-panel-symbol"><Layers3 size={18} /></div>
        <div><p>Board toolkit</p><h2>Design Studio</h2></div>
        <span className="design-beta-tag">Beta</span>
        <button className="design-panel-close" type="button" onClick={onClose} aria-label="Close Design Studio"><X size={17} /></button>
      </header>

      <div className="design-panel-tabs" role="tablist" aria-label="Design Studio tools">
        <button type="button" role="tab" aria-selected={tab === "layers"} className={tab === "layers" ? "active" : ""} onClick={() => setTab("layers")}><Layers3 size={14} /> Layers</button>
        <button type="button" role="tab" aria-selected={tab === "frames"} className={tab === "frames" ? "active" : ""} onClick={() => setTab("frames")}><Frame size={14} /> Frames</button>
        <button type="button" role="tab" aria-selected={tab === "components"} className={tab === "components" ? "active" : ""} onClick={() => setTab("components")}><Box size={14} /> Components</button>
        <button type="button" role="tab" aria-selected={tab === "tokens"} className={tab === "tokens" ? "active" : ""} onClick={() => setTab("tokens")}><LayoutGrid size={14} /> Tokens</button>
      </div>

      {tab === "layers" && <div className="design-panel-content">
        <div className="design-section-heading"><div><strong>Canvas layers</strong><span>{visibleElements.length} objects · top layer first</span></div><span className="design-selected-count">{selectedCount} selected</span></div>
        {visibleElements.length ? <div className="design-layer-list">{visibleElements.map((element, index) => <article className={`design-layer-row ${selectedElementIds.includes(element.id) ? "selected" : ""} ${element.isDeleted ? "hidden" : ""}`} key={element.id}>
          <button className="design-layer-select" type="button" onClick={() => onSelectElement(element)} disabled={readOnly}><span className="design-layer-kind">{element.type === "text" ? "T" : element.type === "image" ? "▧" : "◇"}</span><span>{layerName(element, visibleElements.length - index - 1)}</span></button>
          {!readOnly && <div className="design-layer-actions"><button type="button" onClick={() => onMoveLayer?.(element.id, "up")} title="Move layer up"><ArrowUp size={13} /></button><button type="button" onClick={() => onMoveLayer?.(element.id, "down")} title="Move layer down"><ArrowDown size={13} /></button><button type="button" onClick={() => updateLayer(element.id, { isDeleted: !element.isDeleted })} title={element.isDeleted ? "Show layer" : "Hide layer"}>{element.isDeleted ? <EyeOff size={13} /> : <Eye size={13} />}</button><button type="button" onClick={() => updateLayer(element.id, { locked: !element.locked })} title={element.locked ? "Unlock layer" : "Lock layer"}>{element.locked ? <Lock size={13} /> : <LockOpen size={13} />}</button></div>}
        </article>)}</div> : <div className="design-empty"><Layers3 size={20} /><strong>No layers yet</strong><span>Objects you add to the canvas will appear here.</span></div>}
        <div className="design-panel-tip">Select a layer to focus it on the canvas. Hide or lock objects without removing them from the room.</div>
      </div>}

      {tab === "frames" && <div className="design-panel-content">
        <div className="design-section-heading"><div><strong>Frame presets</strong><span>Start with a canvas size that fits your target.</span></div></div>
        <div className="design-frame-grid">{FRAME_PRESETS.map((preset) => { const Icon = preset.icon; return <button type="button" key={preset.id} onClick={() => onCreateFrame(preset.id)} disabled={readOnly}><Icon size={19} /><strong>{preset.label}</strong><span>{preset.size}</span><Plus size={13} className="design-frame-plus" /></button>; })}</div>
        <div className="design-frame-library-heading"><strong>Room frames</strong><span>{frames.length} saved</span></div>
        {frames.length ? <div className="design-frame-list">{frames.map((frame) => <article key={frame.id}>{renamingFrameId === frame.id ? <form className="design-frame-rename" onSubmit={(event) => submitFrameRename(event, frame)}><input autoFocus value={frameDraft} onChange={(event) => setFrameDraft(event.target.value)} maxLength={80} aria-label="Frame name" /><button type="submit" disabled={!frameDraft.trim()} title="Save frame name"><Check size={13} /></button><button type="button" onClick={() => setRenamingFrameId("")} title="Cancel"><X size={13} /></button></form> : <><button type="button" className="design-frame-focus" onClick={() => onSelectElement?.(frame)}><Frame size={14} /><span><strong>{frame.customData?.frameName || "Untitled frame"}</strong><small>{FRAME_PRESETS.find((preset) => preset.id === frame.customData?.framePreset)?.size || `${Math.round(frame.width)} × ${Math.round(frame.height)}`}</small></span></button>{!readOnly && <div><button type="button" onClick={() => beginFrameRename(frame)} title="Rename frame"><Pencil size={12} /></button><button type="button" onClick={() => updateLayer(frame.id, { locked: !frame.locked })} title={frame.locked ? "Unlock frame" : "Lock frame"}>{frame.locked ? <Lock size={12} /> : <LockOpen size={12} />}</button><button type="button" onClick={() => onDeleteFrame?.(frame)} title="Delete frame"><Trash2 size={12} /></button></div>}</>}</article>)}</div> : <div className="design-frame-empty">Your room frames will appear here.</div>}
        <div className="design-panel-tip">Frame presets are editable canvas boundary rectangles, not yet native responsive containers. Place related objects inside their bounds.</div>
        <button className="design-presentation-button" type="button" onClick={onPresent}><Presentation size={15} /> Present canvas</button>
      </div>}

      {tab === "components" && <div className="design-panel-content">
        <div className="design-section-heading"><div><strong>Component library</strong><span>Reuse groups of canvas elements.</span></div><span className="design-selected-count">{components.length}</span></div>
        {!readOnly && <form className="design-create-component" onSubmit={saveComponent}><input maxLength={80} value={componentName} onChange={(event) => setComponentName(event.target.value)} placeholder={selectedCount ? "Name the selected component" : "Select canvas elements first"} disabled={!selectedCount} /><button type="submit" disabled={!selectedCount || !componentName.trim()}><PackagePlus size={14} /> Save</button></form>}
        {components.length ? <div className="design-component-list">{components.map((component) => <article className={`design-component-card ${selectedComponentId === component.id ? "active" : ""}`} key={component.id}>
          <button type="button" className="design-component-main" onClick={() => setSelectedComponentId(component.id)}><span className="design-component-preview"><Box size={19} /></span><span><strong>{component.name}</strong><small>{component.elements?.length || 0} elements · {component.variants?.length || 1} variants</small></span><ChevronDown size={13} /></button>
          {selectedComponentId === component.id && <div className="design-component-details"><div className="design-variant-list">{(component.variants?.length ? component.variants : [{ id: "default", name: "Default" }]).map((variant) => <button type="button" key={variant.id} onClick={() => onInsertComponent(component, variant.id)} disabled={readOnly}><span>{variant.name}</span><Plus size={12} /></button>)}</div><div className="design-component-actions">{!readOnly && <button type="button" onClick={() => onSaveVariant?.(component.id, `Variant ${(component.variants?.length || 1) + 1}`)}><Plus size={12} /> Save selection as variant</button>}<button type="button" className="design-delete-action" onClick={() => deleteComponent(component.id)} disabled={readOnly}><Trash2 size={12} /> Remove</button></div></div>}
        </article>)}</div> : <div className="design-empty"><Box size={20} /><strong>No components saved</strong><span>Select a group of objects on the canvas and save it here for reuse.</span></div>}
        <div className="design-panel-tip">Variants capture the current selection as another reusable version. Insert any saved variant back onto the canvas.</div>
      </div>}

      {tab === "tokens" && <div className="design-panel-content">
        <div className="design-section-heading"><div><strong>Design tokens</strong><span>Keep a consistent color language in this room.</span></div><span className="design-selected-count">{tokens.length}</span></div>
        {!readOnly && <form className="design-token-form" onSubmit={createToken}><div><input type="color" value={tokenValue} onChange={(event) => setTokenValue(event.target.value)} aria-label="Token color" /><input value={tokenName} onChange={(event) => setTokenName(event.target.value)} placeholder="Token name · e.g. Brand / Primary" maxLength={60} /></div><button type="submit" disabled={!tokenName.trim() || tokens.some((token) => token.name.toLowerCase() === tokenName.trim().toLowerCase())}><Plus size={13} /> Add token</button></form>}
        {tokens.length ? <div className="design-token-list">{tokens.map((token) => <article className="design-token-row" key={token.id}><span className="design-token-swatch" style={{ background: token.value }} /><div><strong>{token.name}</strong><small>{token.value}</small></div><button type="button" onClick={() => onApplyToken(token)} disabled={readOnly || !selectedCount} title={selectedCount ? "Apply to selected elements" : "Select canvas elements first"}><Check size={13} /></button><button type="button" className="design-token-delete" onClick={() => deleteToken(token.id)} disabled={readOnly} aria-label={`Delete ${token.name}`}><Trash2 size={12} /></button></article>)}</div> : <div className="design-empty"><LayoutGrid size={20} /><strong>No design tokens</strong><span>Add named colors and apply them to selected shapes.</span></div>}
        <div className="design-panel-tip">Color tokens live with this room and sync to collaborators. Select one or more shapes to apply a token.</div>
      </div>}

      <footer className="design-panel-footer">
        <div className="design-auto-layout"><div><strong><WandSparkles size={13} /> Auto layout</strong><span>{selectedCount < 2 ? "Select 2+ objects to arrange" : `${selectedCount} selected objects`}</span></div><label>Gap <input type="number" min="0" max="500" value={layoutGap} onChange={(event) => setLayoutGap(Math.max(0, Math.min(500, Number(event.target.value) || 0)))} disabled={readOnly} /></label></div>
        <div className="design-layout-actions"><button type="button" disabled={readOnly || selectedCount < 2} onClick={() => onAutoLayout("horizontal", layoutGap)}>Arrange horizontally</button><button type="button" disabled={readOnly || selectedCount < 2} onClick={() => onAutoLayout("vertical", layoutGap)}>Arrange vertically</button></div>
        <p><span /> DESIGN DATA SYNCED WITH ROOM</p>
      </footer>
    </aside>
  );
}
