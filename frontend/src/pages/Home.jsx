import { useEffect, useRef, useState } from "react";
import {
  Menu, X, Eraser, Hand, MousePointer2, NotebookText, Presentation,
  Share2, Shapes, SquareKanban, Square, Circle, Type, Users, WandSparkles,
  Layers, GitPullRequest, GitCommitHorizontal, Eye, Zap, Check, ArrowRight, ArrowLeft,
  Copy, Sun, Moon, LockKeyhole, Globe2, MessageCircle, History, ListTodo, Wifi,
  PanelRight, GitMerge, Download, CheckCircle2, Sparkles
} from "lucide-react";
import ArcMark from "../components/ArcMark.jsx";
import Drawer from "../components/Drawer.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import RollText from "../components/RollText.jsx";
import { GitHubIcon, XIcon } from "../components/BrandIcons.jsx";

/* ---------- Hero product mock ---------- */
function BoardMock() {
  const tools = [MousePointer2, Hand, Square, Circle, Type, Eraser];
  return (
    <div className="hp-mock">
      <div className="hp-mock-canvas">
        <svg viewBox="0 0 760 440" role="img" aria-label="A sample board">
          <defs>
            <pattern id="hp-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle className="hp-dot" cx="1.5" cy="1.5" r="1.1" /></pattern>
          </defs>
          <rect width="760" height="440" fill="url(#hp-dots)" />
          <rect className="hp-node hp-node-solid" x="84" y="128" width="176" height="92" rx="22" />
          <rect className="hp-node" x="470" y="96" width="176" height="92" rx="22" />
          <rect className="hp-node" x="296" y="268" width="176" height="84" rx="22" />
          <path className="hp-link" d="M260 174 C 360 174, 380 142, 470 142" />
          <path className="hp-link" d="M558 188 C 558 260, 524 310, 472 310" />
          <path className="hp-link hp-link-dash" d="M172 220 C 172 300, 220 310, 296 310" />
          <g textAnchor="middle" className="hp-node-text hp-node-text-solid"><text x="172" y="180">Idea</text></g>
          <g textAnchor="middle" className="hp-node-text"><text x="558" y="148">Plan</text><text x="384" y="315">Ship</text></g>
        </svg>
        <div className="hp-m-title"><span className="hp-m-menu"><i /><i /><i /></span><b>Product map<small>Board</small></b></div>
        <div className="hp-m-share"><Share2 size={15} /> Share</div>
        <div className="hp-m-dock"><span className="on"><SquareKanban size={18} strokeWidth={1.7} /></span><span><WandSparkles size={18} strokeWidth={1.7} /></span><span><Layers size={18} strokeWidth={1.7} /></span><span><Presentation size={18} strokeWidth={1.7} /></span></div>
        <div className="hp-m-tools">
          {tools.map(function (Icon, index) {
            return <span key={index} className={index === 0 ? "on" : ""}><Icon size={18} strokeWidth={1.7} /></span>;
          })}
        </div>
        <div className="hp-cursor hp-cursor-a"><svg viewBox="0 0 18 22" aria-hidden="true"><path d="M2 1 16 13 9.4 14.2 6 20Z" /></svg><span>Maya</span></div>
        <div className="hp-cursor hp-cursor-b"><svg viewBox="0 0 18 22" aria-hidden="true"><path d="M2 1 16 13 9.4 14.2 6 20Z" /></svg><span>You</span></div>
      </div>
    </div>
  );
}

/* ---------- What makes a room different ---------- */
const FEATURES = [
  {
    key: "board", icon: Shapes, title: "Boards and notes", line: "Think visually or write it down. Keep both in one room.", cta: "Start a board",
    points: [
      { icon: Shapes, title: "Infinite canvas", text: "Sketch flows, map ideas and arrange editable objects." },
      { icon: NotebookText, title: "Room notes", text: "Keep decisions and working notes beside the canvas." },
      { icon: Wifi, title: "Offline ready", text: "Keep working locally when the connection drops." }
    ]
  },
  {
    key: "agent", icon: WandSparkles, title: "Design Agent", line: "Turn a brief into editable canvas elements.", cta: "Try the Design Agent",
    points: [
      { icon: WandSparkles, title: "Prompt to canvas", text: "Describe a screen or flow and generate a first pass." },
      { icon: Layers, title: "Native objects", text: "Generated elements stay editable on the board." },
      { icon: Users, title: "Room-aware", text: "Build from the room context and selected elements." }
    ]
  },
  {
    key: "live", icon: Zap, title: "Live editing", line: "Work together on the same canvas in real time.", cta: "Open a room",
    points: [
      { icon: Users, title: "Shared presence", text: "See room participants and live cursors." },
      { icon: Zap, title: "Instant sync", text: "Edits appear for connected collaborators." },
      { icon: MessageCircle, title: "Discussion", text: "Keep conversation close to the work." }
    ]
  },
  {
    key: "commit", icon: GitPullRequest, title: "Commit and review", line: "Let editors propose changes before they merge.", cta: "Explore a room",
    points: [
      { icon: GitCommitHorizontal, title: "Private drafts", text: "Editors can work without changing the shared room." },
      { icon: Eye, title: "Before and after", text: "Review a proposal before accepting it." },
      { icon: GitMerge, title: "Owner approval", text: "Merge or decline submitted changes with a note." }
    ]
  },
  {
    key: "share", icon: Share2, title: "Share and access", line: "Choose who can view, join or edit your room.", cta: "Create a room",
    points: [
      { icon: Globe2, title: "Public rooms", text: "People with the link can join without waiting for approval." },
      { icon: LockKeyhole, title: "Private rooms", text: "Review join requests before someone becomes a member." },
      { icon: Eye, title: "View first", text: "Shared links open in read-only mode without sign-in." }
    ]
  },
  {
    key: "project", icon: ListTodo, title: "Tasks and milestones", line: "Turn the room into a lightweight project space.", cta: "Open a room",
    points: [
      { icon: ListTodo, title: "Task lists", text: "Create work items and track progress." },
      { icon: Users, title: "Assignments", text: "Make ownership clear across the team." },
      { icon: Shapes, title: "Linked work", text: "Connect project work back to room content." }
    ]
  },
  {
    key: "discussion", icon: MessageCircle, title: "Discussion and comments", line: "Keep decisions attached to the work.", cta: "Open a room",
    points: [
      { icon: MessageCircle, title: "Room discussion", text: "Talk through ideas without leaving the room." },
      { icon: CheckCircle2, title: "Resolve threads", text: "Close out comments when a decision is made." }
    ]
  },
  {
    key: "history", icon: History, title: "History and exports", line: "Keep a record and take your work with you.", cta: "Open a room",
    points: [
      { icon: History, title: "Room history", text: "Review saved versions and restore a previous state." },
      { icon: Download, title: "Export", text: "Download board and room data in supported formats." }
    ]
  },
  {
    key: "theme", icon: Sun, title: "Your workspace", line: "A focused interface that adapts to your setup.", cta: "Open workspace",
    points: [
      { icon: Sun, title: "Light and dark", text: "Switch appearance without changing your work." },
      { icon: Wifi, title: "Local-first", text: "Start locally and connect a room when you need to collaborate." },
      { icon: PanelRight, title: "Flexible tools", text: "Open project, agent and discussion panels when needed." }
    ]
  }
];

function scrollToId(id) {
  const node = document.getElementById(id);
  if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
}

function ProductSimulation() {
  const [step, setStep] = useState(0);
  const [appearance, setAppearance] = useState("dark");
  const [mode, setMode] = useState("live");
  const [visibility, setVisibility] = useState("private");
  const [tool, setTool] = useState("select");
  const [objects, setObjects] = useState(8);
  const [prompt, setPrompt] = useState("Design a clean product dashboard with a clear hierarchy and useful metrics.");
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState(false);

  const steps = [
    { label: "Board", title: "Start with a working board", detail: "Sketch ideas, connect them and keep every object editable." },
    { label: "Design Agent", title: "Bring in the Design Agent", detail: "Describe what you need, generate a first pass and add it to the same canvas." },
    { label: "Live / Commit", title: "Choose how the team works", detail: "Collaborate live or keep edits private until you review and merge them." },
    { label: "Share", title: "Share the room on your terms", detail: "Choose public or private access, then share a view-first link." }
  ];

  function changeStep(next) { setStep(Math.max(0, Math.min(steps.length - 1, next))); }
  function handleCopy() {
    const url = "https://arcdraw.vercel.app/";
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => setCopied(true)).catch(() => setCopied(false));
    }
  }

  return (
    <div className="hp-product-demo" id="hp-product-demo">
      <div className="hp-demo-intro">
        <div><span className="hp-eyebrow">One room. The whole workflow.</span><h3>See how it comes together.</h3></div>
        <span className="hp-demo-caption"><span /> Interactive product preview</span>
      </div>
      <div className="hp-demo-shell" data-demo-theme={appearance}>
        <div className="hp-demo-topbar">
          <div className="hp-demo-brand"><ArcMark /><span>arcdraw</span><i /></div>
          <div className="hp-demo-room-title"><strong>Ayush Aman</strong><small>Product map <span>·</span> Board</small></div>
          <div className="hp-demo-actions">
            <span className="hp-demo-saved"><CheckCircle2 size={13} /> Saved</span>
            <button className="hp-demo-theme" type="button" onClick={() => setAppearance(appearance === "dark" ? "light" : "dark")} aria-label={appearance === "dark" ? "Switch preview to light mode" : "Switch preview to dark mode"} title={appearance === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              {appearance === "dark" ? <Sun size={15} /> : <Moon size={15} />}<span>{appearance === "dark" ? "Dark" : "Light"}</span>
            </button>
            <button className={"hp-demo-top-action " + (step === 1 ? "is-active" : "")} type="button" onClick={() => changeStep(1)}><WandSparkles size={14} /> Agent</button>
            <button className={"hp-demo-top-action " + (step === 2 ? "is-active" : "")} type="button" onClick={() => changeStep(2)}><span className="hp-demo-mode-dot" />{mode === "live" ? "Live" : "Commit"}</button>
            <button className={"hp-demo-top-action hp-demo-share-action " + (step === 3 ? "is-active" : "")} type="button" onClick={() => changeStep(3)}><Share2 size={14} /> Share</button>
          </div>
        </div>

        <div className="hp-demo-workspace">
          <aside className="hp-demo-tools" aria-label="Board tools">
            {[
              ["select", MousePointer2, "Select"], ["hand", Hand, "Pan"], ["rectangle", Square, "Rectangle"],
              ["ellipse", Circle, "Ellipse"], ["text", Type, "Text"], ["eraser", Eraser, "Eraser"]
            ].map(([id, Icon, label]) => (
              <button key={id} type="button" className={tool === id ? "is-active" : ""} onClick={() => { setTool(id); if (id === "rectangle" || id === "ellipse" || id === "text") setObjects((count) => count + 1); }} aria-label={label} title={label}><Icon size={17} /></button>
            ))}
          </aside>

          <div className="hp-demo-canvas-wrap">
            <div className="hp-demo-canvas-heading"><div><span className="hp-demo-breadcrumb">ROOM / BOARD</span><strong>Product map</strong></div><span className="hp-demo-board-status"><i /> {objects} objects</span></div>
            <div className="hp-demo-canvas" onClick={() => { if (tool !== "select" && tool !== "hand" && tool !== "eraser") setObjects((count) => count + 1); }} role="button" tabIndex={0} aria-label="Interactive canvas. Choose a drawing tool and tap to add an object." onKeyDown={(event) => { if (event.key === "Enter" && tool !== "select" && tool !== "hand" && tool !== "eraser") setObjects((count) => count + 1); }}>
              <svg viewBox="0 0 760 430" aria-hidden="true" className="hp-demo-scene">
                <defs><pattern id="hp-demo-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" className="hp-demo-grid-dot" /></pattern></defs>
                <rect width="760" height="430" fill="url(#hp-demo-grid)" />
                <path d="M250 145 C 330 145 340 115 425 115 M520 160 C 550 208 520 230 470 270 M248 160 C 250 230 300 268 360 270" className="hp-demo-connector" />
                <rect x="90" y="104" width="160" height="88" rx="15" className="hp-demo-node hp-demo-node-primary" />
                <rect x="425" y="74" width="190" height="88" rx="15" className="hp-demo-node" />
                <rect x="290" y="270" width="180" height="82" rx="15" className="hp-demo-node" />
                <text x="170" y="143" textAnchor="middle" className="hp-demo-node-title hp-demo-inverse">Discovery</text><text x="170" y="164" textAnchor="middle" className="hp-demo-node-sub hp-demo-inverse">Ideas and research</text>
                <text x="520" y="113" textAnchor="middle" className="hp-demo-node-title">Design</text><text x="520" y="134" textAnchor="middle" className="hp-demo-node-sub">Explore directions</text>
                <text x="380" y="306" textAnchor="middle" className="hp-demo-node-title">Launch</text><text x="380" y="327" textAnchor="middle" className="hp-demo-node-sub">Ship together</text>
                <rect x="108" y="218" width="88" height="9" rx="4.5" className="hp-demo-sticky-line" /><rect x="108" y="237" width="126" height="9" rx="4.5" className="hp-demo-sticky-line soft" />
                <rect x="545" y="216" width="116" height="72" rx="12" className="hp-demo-note" /><text x="560" y="241" className="hp-demo-note-title">Next up</text><rect x="560" y="253" width="77" height="6" rx="3" className="hp-demo-sticky-line" />
              </svg>
              {step === 0 && <span className="hp-demo-cursor"><MousePointer2 size={15} /> Ayush Aman</span>}
              {generated && <span className="hp-demo-added"><Check size={12} /> Design added to board</span>}
            </div>
            <div className="hp-demo-canvas-footer"><span><MousePointer2 size={12} /> {tool === "select" ? "Select and move" : `Tool: ${tool}`}</span><span>100%</span><button type="button" onClick={() => setObjects((count) => Math.max(1, count - 1))}>−</button><button type="button" onClick={() => setObjects((count) => count + 1)}>＋</button></div>
          </div>

          <aside className="hp-demo-inspector">
            {step === 0 && <>
              <div className="hp-demo-panel-head"><span>ROOM DETAILS</span><button type="button" aria-label="Open Design Agent" onClick={() => changeStep(1)}><WandSparkles size={16} /></button></div>
              <div className="hp-demo-profile"><span className="hp-demo-avatar">A</span><div><strong>Ayush Aman</strong><small>Room owner</small></div><span className="hp-demo-owner-check"><Check size={11} /></span></div>
              <div className="hp-demo-inspector-group"><small>BOARD</small><strong>Product map</strong><p>A shared space for shaping ideas into a plan.</p></div>
              <div className="hp-demo-inspector-group"><small>ROOM ACTIVITY</small><div className="hp-demo-mini-row"><span /> <b>All changes saved</b></div><div className="hp-demo-mini-row"><span /> <b>Ready to collaborate</b></div></div>
              <button type="button" className="hp-demo-panel-cta" onClick={() => changeStep(1)}><WandSparkles size={14} /> Open Design Agent</button>
            </>}
            {step === 1 && <>
              <div className="hp-demo-panel-head"><span>DESIGN AGENT</span><WandSparkles size={16} /></div>
              <div className="hp-demo-agent-intro"><span className="hp-demo-agent-icon"><Sparkles size={17} /></span><strong>What should we design?</strong><p>Describe an idea. The Agent will turn it into editable board elements.</p></div>
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} aria-label="Design Agent prompt" />
              <div className="hp-demo-prompt-count">{prompt.length} / 2000</div>
              <button type="button" className="hp-demo-panel-cta" onClick={() => { setGenerated(true); setObjects((count) => count + 3); }} disabled={prompt.trim().length < 8}><WandSparkles size={14} /> Generate preview</button>
              <div className="hp-demo-agent-foot">Preview interaction · no credits used</div>
            </>}
            {step === 2 && <>
              <div className="hp-demo-panel-head"><span>HOW THIS ROOM WORKS</span><Zap size={16} /></div>
              <div className="hp-demo-mode-options">
                <button type="button" onClick={() => setMode("live")} className={mode === "live" ? "is-selected" : ""}><span><Zap size={16} /></span><b>Live editing</b><small>Everyone with edit access works on the same room together.</small>{mode === "live" && <Check size={15} />}</button>
                <button type="button" onClick={() => setMode("commit")} className={mode === "commit" ? "is-selected" : ""}><span><GitPullRequest size={16} /></span><b>Commit and review</b><small>Editors work in private drafts. Owners review before changes merge.</small>{mode === "commit" && <Check size={15} />}</button>
              </div>
              <div className="hp-demo-panel-note">{mode === "live" ? "Changes are visible to everyone as you work." : "Submitted changes wait for the owner to merge or decline."}</div>
            </>}
            {step === 3 && <>
              <div className="hp-demo-panel-head"><span>SHARE ROOM</span><Share2 size={16} /></div>
              <div className="hp-demo-share-note"><Eye size={15} /><span>Shared links open in view-only mode. Sign in only when someone chooses to edit.</span></div>
              <small className="hp-demo-field-label">WHO CAN JOIN</small>
              <div className="hp-demo-visibility">
                <button type="button" className={visibility === "private" ? "is-selected" : ""} onClick={() => setVisibility("private")}><LockKeyhole size={15} /><span><b>Private</b><small>Approval required</small></span>{visibility === "private" && <Check size={14} />}</button>
                <button type="button" className={visibility === "public" ? "is-selected" : ""} onClick={() => setVisibility("public")}><Globe2 size={15} /><span><b>Public</b><small>Join immediately</small></span>{visibility === "public" && <Check size={14} />}</button>
              </div>
              <small className="hp-demo-field-label">ROOM LINK</small>
              <div className="hp-demo-copy-row"><span>arcdraw.vercel.app</span><button type="button" onClick={handleCopy} aria-label="Copy website address">{copied ? <Check size={14} /> : <Copy size={14} />}</button></div>
              <div className="hp-demo-agent-foot">{copied ? "Address copied" : "Preview only · create a room to make a real link"}</div>
            </>}
          </aside>
        </div>

        <div className="hp-demo-tour">
          <div className="hp-demo-tour-steps" role="tablist" aria-label="Product preview steps">
            {steps.map((item, index) => <button type="button" key={item.label} role="tab" aria-selected={step === index} className={step === index ? "is-active" : step > index ? "is-done" : ""} onClick={() => changeStep(index)}><span>{step > index ? <Check size={12} /> : `0${index + 1}`}</span>{item.label}</button>)}
          </div>
          <div className="hp-demo-tour-copy"><div><strong>{steps[step].title}</strong><p>{steps[step].detail}</p></div><div className="hp-demo-tour-controls"><button type="button" className="hp-demo-prev" onClick={() => changeStep(step - 1)} disabled={step === 0}><ArrowLeft size={15} /> Back</button><button type="button" className="hp-demo-next" onClick={() => changeStep(step === 3 ? 0 : step + 1)}>{step === 3 ? "Start again" : "Next step"}<ArrowRight size={15} /></button></div></div>
        </div>
      </div>
    </div>
  );
}

export default function Home({ onContinue, onSignIn, hasGuestSession, user }) {
  const [feature, setFeature] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [slider, setSlider] = useState({ left: 0, width: 0, show: false });
  const linksRef = useRef(null);

  // Nav morphs into a floating pill after a small scroll. Two thresholds stop it flickering at the edge.
  useEffect(function () {
    let frame = 0;
    let lastY = window.scrollY;
    let lastToggleY = window.scrollY;
    function update() {
      frame = 0;
      const y = window.scrollY;
      const wide = true;
      setScrolled(function (current) { return wide && (current ? y > 8 : y > 28); });
      // Collapse into a single icon after a real scroll down, bring it back when scrolling up.
      setCollapsed(function (current) {
        if (!wide || y < 120) return false;
        const goingDown = y > lastY;
        lastY = y;
        if (goingDown && y - lastToggleY > 24) { lastToggleY = y; return true; }
        if (!goingDown && lastToggleY - y > 24) { lastToggleY = y; return false; }
        return current;
      });
    }
    function onScroll() { if (!frame) frame = window.requestAnimationFrame(update); }
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return function () {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  function moveSlider(event) {
    const target = event.currentTarget;
    setSlider({ left: target.offsetLeft, width: target.offsetWidth, show: true });
  }
  function hideSlider() { setSlider(function (current) { return { ...current, show: false }; }); }
  function enterNav() { setHovered(true); }
  function leaveNav() { setHovered(false); }
  function toggleMenu() { setMenuOpen(function (open) { return !open; }); }
  function closeMenu() { setMenuOpen(false); }
  function menuGo(action) { return function () { setMenuOpen(false); action(); }; }

  function openBoards() { onContinue("boards"); }
  function openNotes() { onContinue("notes"); }
  function openWorkspace() { onContinue(); }
  function handleSignIn() { if (user) openWorkspace(); else onSignIn(); }
  function pick(item) { return function () { setFeature(item); }; }
  function closeFeature() { setFeature(null); }
  function goFeatures() { scrollToId("hp-features"); }
  function goModes() { scrollToId("hp-product-demo"); }
  function goSteps() { scrollToId("hp-product-demo"); }

  const FeatureIcon = feature?.icon;

  return (
    <main className="hp">
      <header className={"hp-nav" + (scrolled ? " is-scrolled" : "") + (collapsed ? " is-collapsed" : "")}>
        <div className="hp-nav-inner">
          <a className="brand-lockup" href="#/" aria-label="Arcdraw home"><ArcMark /><span>arcdraw</span></a>
          <nav className="hp-nav-links" aria-label="Sections" ref={linksRef} onMouseLeave={hideSlider}>
            <span className={"hp-nav-slider" + (slider.show ? " is-on" : "")} style={{ transform: "translateX(" + slider.left + "px)", width: slider.width + "px" }} aria-hidden="true" />
            <button className="roll-host" type="button" onClick={goFeatures} onMouseEnter={moveSlider} onFocus={moveSlider}><RollText text="Product" /></button>
            <button className="roll-host" type="button" onClick={goModes} onMouseEnter={moveSlider} onFocus={moveSlider}><RollText text="Teamwork" /></button>
            <button className="roll-host" type="button" onClick={goSteps} onMouseEnter={moveSlider} onFocus={moveSlider}><RollText text="How it works" /></button>
          </nav>
          <div className="hp-nav-right">
            <ThemeToggle compact />
            <button className="text-button hp-signin roll-host" type="button" onClick={handleSignIn}><RollText text={user ? "Hi " + (user.name?.split(" ")[0] || "there") : "Sign in"} /></button>
            <button className="primary-button hp-nav-cta roll-host" type="button" onClick={openWorkspace}><RollText text={hasGuestSession || user ? "Open workspace" : "Get started free"} /></button>
            <button className="hp-burger" type="button" onClick={toggleMenu} aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen}>{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
          </div>
        </div>
        <div className={"hp-menu" + (menuOpen ? " is-open" : "")}>
          <button className="hp-menu-cta" type="button" onClick={menuGo(openWorkspace)}>{hasGuestSession || user ? "Open workspace" : "Get started free"}</button>
          <button type="button" onClick={menuGo(goFeatures)}>Product</button>
          <button type="button" onClick={menuGo(goModes)}>Teamwork</button>
          <button type="button" onClick={menuGo(goSteps)}>How it works</button>
          <button type="button" onClick={menuGo(handleSignIn)}>{user ? "Open workspace" : "Sign in"}</button>
        </div>
      </header>

      <section className="hp-hero">
        <h1 className="hp-rise" style={{ "--d": "80ms" }}>The workspace where ideas become shipped work.</h1>
        <p className="hp-lead hp-rise" style={{ "--d": "160ms" }}>Boards, notes, tasks and a Design Agent in one calm room. Describe an idea, build it on canvas and refine it together.</p>
        <div className="hp-actions hp-rise" style={{ "--d": "240ms" }}>
          <button className="primary-button hp-big" type="button" onClick={openBoards}><Shapes size={19} strokeWidth={1.8} /> Start a board</button>
          <button className="secondary-button hp-big" type="button" onClick={openNotes}><NotebookText size={19} strokeWidth={1.8} /> Write a note</button>
        </div>
        <ul className="hp-trust hp-rise" style={{ "--d": "320ms" }}>
          <li><Check size={15} /> Free to start</li>
          <li><Check size={15} /> Works offline</li>
          <li><Check size={15} /> Saved on your device</li>
        </ul>
        <div className="hp-rise hp-mock-wrap" style={{ "--d": "400ms" }}><BoardMock /></div>
      </section>

      <section className="hp-section hp-whats-different" id="hp-features" aria-label="What's different">
        <div className="hp-section-head">
          <span className="hp-eyebrow">What's different</span>
          <h2>Everything happens in one room.</h2>
          <p>Start with a board. Bring in your team, your agent and the work that moves the idea forward.</p>
        </div>
        <ProductSimulation />
        <div className="hp-room-features" id="hp-demo-modes">
          {FEATURES.map(function (item) {
            const Icon = item.icon;
            return (
              <button className="hp-room-feature" type="button" key={item.key} onClick={pick(item)} aria-haspopup="dialog">
                <span className="hp-room-feature-icon"><Icon size={17} strokeWidth={1.8} /></span>
                <span className="hp-room-feature-copy"><strong>{item.title}</strong><small>{item.line}</small></span>
                <ArrowRight size={15} className="hp-room-feature-arrow" />
              </button>
            );
          })}
        </div>
      </section>

      <footer className="hp-footer">
        <div className="hp-footer-inner">
          <div className="hp-footer-brand">
            <a className="brand-lockup" href="#/" aria-label="Arcdraw home"><ArcMark /><span>arcdraw</span></a>
            <p>Boards, notes and tasks in one calm workspace.</p>
          </div>
          <div className="hp-footer-col"><strong>Product</strong><button type="button" onClick={goFeatures}>Boards</button><button type="button" onClick={goFeatures}>Notes</button><button type="button" onClick={goFeatures}>Project</button><button type="button" onClick={goFeatures}>Design Agent</button></div>
          <div className="hp-footer-col"><strong>Teams</strong><button type="button" onClick={goModes}>Live editing</button><button type="button" onClick={goModes}>Commit and review</button><button type="button" onClick={goSteps}>How it works</button></div>
          <div className="hp-footer-col"><strong>Account</strong><button type="button" onClick={handleSignIn}>{user ? "Open workspace" : "Sign in"}</button><button type="button" onClick={openWorkspace}>Workspace</button></div>
        </div>
        <div className="hp-footer-bar">
          <span>© 2026 arcdraw</span>
          <span className="hp-footer-social">
            <a href="https://x.com/ayushxdevz" target="_blank" rel="noopener noreferrer" aria-label="Arcdraw on X"><XIcon size={17} /></a>
            <a href="https://github.com/ayushdevvv/arcdraw" target="_blank" rel="noopener noreferrer" aria-label="Arcdraw on GitHub"><GitHubIcon size={18} /></a>
          </span>
        </div>
      </footer>

      {feature && (
        <Drawer
          title={feature.title}
          subtitle={feature.line}
          icon={<FeatureIcon size={21} strokeWidth={1.8} />}
          onClose={closeFeature}
          footer={function ({ close }) {
            return (
              <>
                <button className="secondary-button" type="button" onClick={close}>Close</button>
                <button className="primary-button" type="button" onClick={openBoards}>{feature.cta}</button>
              </>
            );
          }}
        >
          <div className="hp-feature-drawer-head"><span><FeatureIcon size={22} strokeWidth={1.7} /></span><p>{feature.line}</p></div>
          <div className="hp-points">
            {feature.points.map(function (point) {
              const PointIcon = point.icon;
              return (
                <div className="hp-point" key={point.title}>
                  <span><PointIcon size={20} strokeWidth={1.7} /></span>
                  <div><strong>{point.title}</strong><small>{point.text}</small></div>
                </div>
              );
            })}
          </div>
        </Drawer>
      )}
    </main>
  );
}
