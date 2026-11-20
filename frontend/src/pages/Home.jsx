import { useEffect, useRef, useState } from "react";
import {
  Menu, X, Eraser, Hand, ListChecks, MousePointer2, NotebookText, Presentation,
  Share2, Shapes, SquareKanban, Square, Circle, Type, Users, WandSparkles,
  Layers, GitPullRequest, GitCommitHorizontal, Eye, Zap, Check, WifiOff, Video, Mic, RefreshCw,
  Command, Terminal, FolderOpen, Bell, Keyboard
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

/* ---------- Features ---------- */
const FEATURES = [
  {
    key: "agent", icon: WandSparkles, title: "Design Agent", line: "Ideas become editable designs.", cta: "Open Design Agent",
    points: [
      { icon: WandSparkles, title: "Prompt to canvas", text: "Describe it and generate the layout." },
      { icon: Layers, title: "Native objects", text: "Edit every shape, text and sticky." },
      { icon: Users, title: "Room synced", text: "Refine the design together." }
    ]
  },
  {
    key: "commit", icon: GitCommitHorizontal, title: "Commit and review", line: "Nothing ships unreviewed.", cta: "Start a board",
    points: [
      { icon: GitCommitHorizontal, title: "Private drafts", text: "Editors work on their own draft." },
      { icon: Eye, title: "Before and after", text: "Preview every change before it merges." },
      { icon: GitPullRequest, title: "Merge or decline", text: "Owners decide what ships, with a note." }
    ]
  }
];

function FeatureArt({ tone }) {
  if (tone === "commit") return <div className="hp-art hp-art-project"><div><s className="done" /><i /></div><div><s className="done" /><i /></div><div><s /><i /></div></div>;
  return <div className="hp-art hp-art-agent"><span><WandSparkles size={24} strokeWidth={1.5} /></span><i /><i /></div>;
}

const STEPS = [
  { icon: Shapes, title: "Create a room", text: "Open a board or a notes room in one click. No account needed to start." },
  { icon: Share2, title: "Invite your team", text: "Share a link with edit or view access and see everyone on the canvas." },
  { icon: ListChecks, title: "Plan and ship", text: "Turn ideas into tasks, milestones and saved versions inside the same room." }
];

const DESKTOP_FEATURES = [
  { icon: WifiOff, title: "Offline editor", text: "Keep drawing and writing with no connection. Your work waits on your computer." },
  { icon: RefreshCw, title: "Background sync", text: "Changes sync on their own the moment you are back online, with no merge headaches." },
  { icon: Video, title: "Voice and video", text: "Talk through a board with your team without leaving the room." },
  { icon: FolderOpen, title: "Local files", text: "Open and save boards and notes straight from your own folders." },
  { icon: Keyboard, title: "Quick capture", text: "A global shortcut drops a new note or board from any app." },
  { icon: Bell, title: "Native alerts", text: "Get desktop notifications for mentions, reviews and merged changes." }
];

function WindowsIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="2" y="2" width="9.4" height="9.4" />
      <rect x="12.6" y="2" width="9.4" height="9.4" />
      <rect x="2" y="12.6" width="9.4" height="9.4" />
      <rect x="12.6" y="12.6" width="9.4" height="9.4" />
    </svg>
  );
}

const PLATFORMS = [
  { name: "Windows", icon: WindowsIcon },
  { name: "macOS", icon: Command },
  { name: "Linux", icon: Terminal }
];

function DesktopMock() {
  return (
    <div className="hp-win" aria-hidden="true">
      <div className="hp-win-bar"><i /><i /><i /><span>Product map</span><em><WifiOff size={12} /> Offline</em></div>
      <div className="hp-win-body">
        <div className="hp-win-side"><b /><s /><s /><s /><s className="on" /><s /></div>
        <div className="hp-win-canvas">
          <svg viewBox="0 0 420 220">
            <rect className="hp-win-node solid" x="30" y="40" width="120" height="60" />
            <rect className="hp-win-node" x="250" y="30" width="130" height="60" />
            <rect className="hp-win-node" x="140" y="136" width="130" height="58" />
            <path className="hp-win-link" d="M150 70 C 200 70, 210 60, 250 60" />
            <path className="hp-win-link" d="M315 90 C 315 130, 290 160, 270 165" />
            <path className="hp-win-link dash" d="M90 100 C 90 150, 110 165, 140 165" />
          </svg>
          <div className="hp-win-call"><Mic size={13} /><Video size={13} /><span>2 in call</span></div>
        </div>
      </div>
      <div className="hp-win-status"><span><RefreshCw size={12} /> 3 changes waiting to sync</span><span>Saved on this computer</span></div>
    </div>
  );
}

const MODES = [
  { icon: Zap, title: "Live editing", text: "Everyone draws at the same time. Fast, open and collaborative.", points: ["Real time cursors", "Instant sync", "Saved versions on demand"] },
  { icon: GitPullRequest, title: "Commit and review", text: "Editors work on a private draft. You review and merge what ships.", points: ["Private drafts", "Before and after preview", "Merge or decline with a note"] }
];

function scrollToId(id) {
  const node = document.getElementById(id);
  if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
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
  function goModes() { scrollToId("hp-modes"); }
  function goSteps() { scrollToId("hp-steps"); }
  function goSoon() { scrollToId("hp-soon"); }

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
            <button className="roll-host" type="button" onClick={goSoon} onMouseEnter={moveSlider} onFocus={moveSlider}><RollText text="Desktop app" /></button>
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
          <button type="button" onClick={menuGo(goSoon)}>Desktop app</button>
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
          <li><Check size={15} /> No account needed to start</li>
          <li><Check size={15} /> Live collaboration</li>
        </ul>
        <div className="hp-rise hp-mock-wrap" style={{ "--d": "400ms" }}><BoardMock /></div>
      </section>

      <section className="hp-section" id="hp-features" aria-label="Product">
        <div className="hp-section-head">
          <span className="hp-eyebrow">Product</span>
          <h2>Built different.</h2>
          <p>Two things you will not find in a plain whiteboard.</p>
        </div>
        <div className="hp-bento">
          {FEATURES.map(function (item) {
            const Icon = item.icon;
            return (
              <button className={"hp-tile hp-tile-" + item.key} type="button" key={item.key} onClick={pick(item)} aria-haspopup="dialog">
                <FeatureArt tone={item.key} />
                <span className="hp-tile-foot">
                  <span className="hp-tile-icon"><Icon size={20} strokeWidth={1.7} /></span>
                  <span className="hp-tile-text"><strong>{item.title}</strong><small>{item.line}</small></span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="hp-section hp-section-alt" id="hp-modes" aria-label="Teamwork">
        <div className="hp-section-head">
          <span className="hp-eyebrow">Teamwork</span>
          <h2>Work live, or review before it ships.</h2>
          <p>Room owners choose how their team works. Change it any time.</p>
        </div>
        <div className="hp-modes">
          {MODES.map(function (mode) {
            const ModeIcon = mode.icon;
            return (
              <article className="hp-mode" key={mode.title}>
                <span className="hp-mode-icon"><ModeIcon size={22} strokeWidth={1.7} /></span>
                <h3>{mode.title}</h3>
                <p>{mode.text}</p>
                <ul>{mode.points.map(function (point) { return <li key={point}><Check size={15} /> {point}</li>; })}</ul>
              </article>
            );
          })}
        </div>
      </section>

      <section className="hp-section" id="hp-steps" aria-label="How it works">
        <div className="hp-section-head">
          <span className="hp-eyebrow">How it works</span>
          <h2>From first idea to done in three steps.</h2>
        </div>
        <ol className="hp-steps">
          {STEPS.map(function (step, index) {
            const StepIcon = step.icon;
            return (
              <li className="hp-step" key={step.title}>
                <span className="hp-step-num">0{index + 1}</span>
                <span className="hp-step-icon"><StepIcon size={20} strokeWidth={1.7} /></span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="hp-section hp-section-alt" id="hp-soon" aria-label="Desktop app">
        <div className="hp-desk">
          <div className="hp-desk-copy">
            <span className="hp-eyebrow">Coming soon</span>
            <h2>Arcdraw for desktop.</h2>
            <p>Arcdraw is a web app today. A native app is on the way, so your boards and notes work with or without a connection.</p>
            <div className="hp-platforms">
              {PLATFORMS.map(function (platform) {
                const PlatformIcon = platform.icon;
                return (
                  <span className="hp-platform" key={platform.name}>
                    <PlatformIcon size={18} />
                    <b>{platform.name}</b>
                    <small>Soon</small>
                  </span>
                );
              })}
            </div>
          </div>
          <DesktopMock />
        </div>
        <div className="hp-desk-grid">
          {DESKTOP_FEATURES.map(function (item) {
            const DeskIcon = item.icon;
            return (
              <article className="hp-desk-item" key={item.title}>
                <span className="hp-desk-icon"><DeskIcon size={20} strokeWidth={1.7} /></span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
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
          <div className="hp-footer-col"><strong>Teams</strong><button type="button" onClick={goModes}>Live editing</button><button type="button" onClick={goModes}>Commit and review</button><button type="button" onClick={goSteps}>How it works</button><button type="button" onClick={goSoon}>Desktop app</button></div>
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
          <div className="drawer-hero hp-drawer-hero"><FeatureArt tone={feature.key} /></div>
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
