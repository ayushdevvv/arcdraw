import { toast } from "../components/toast/toastStore.js";
import { friendlyError } from "../utils/errors.js";
import { useMemo, useRef, useState } from "react";
import {
  ArrowUpRight, CloudUpload, Copy, Folder, FolderPlus, LayoutGrid, LogIn, LogOut,
  MoreHorizontal, NotebookPen, PanelsTopLeft, Pencil, Plus, Search, Settings2, Star,
  Trash2, Upload, Wifi, WifiOff, X, ChevronsUpDown, FolderInput
} from "lucide-react";
import ArcMark from "../components/ArcMark.jsx";
import Menu from "../components/Menu.jsx";
import Drawer from "../components/Drawer.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import { useBoards } from "../database/useBoards.js";
import { useRoomNoteCounts } from "../database/useRoomNoteCounts.js";
import {
  createBoard, deleteBoard, duplicateBoard, importBoardFile,
  renameBoard, toggleBoardStar, setBoardCloudLink
} from "../database/boardService.js";
import { useFolders } from "../database/useFolders.js";
import { createFolder, deleteFolder, moveRoomToFolder, renameFolder } from "../database/folderService.js";
import { listRoomNotes } from "../database/noteService.js";
import { listRoomProjectItems } from "../database/projectService.js";
import { createCloudBoard } from "../services/boardCloudService.js";
import { useConnectivity } from "../offline/useConnectivity.js";

function formatEdited(value) {
  if (!value) return "Just now";
  const date = new Date(value);
  const now = new Date();
  const diff = Math.max(0, now - date);
  if (diff < 60_000) return "Just now";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (date.toDateString() === now.toDateString()) return `Today, ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

/* Real thumbnail: draws the room's own elements scaled into the card. */
function BoardThumb({ elements = [], index = 0 }) {
  const live = elements.filter(function (item) { return !item.isDeleted && Number.isFinite(item.x) && Number.isFinite(item.y); });
  if (!live.length) {
    return (
      <svg className="wk-thumb-empty" viewBox="0 0 240 150" aria-hidden="true">
        <rect x="52" y="40" width="64" height="38" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <rect x="132" y="72" width="56" height="38" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="4 4" />
        <path d="M116 59h24v13" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  live.forEach(function (item) {
    const w = item.width || 0; const h = item.height || 0;
    minX = Math.min(minX, item.x, item.x + w); minY = Math.min(minY, item.y, item.y + h);
    maxX = Math.max(maxX, item.x, item.x + w); maxY = Math.max(maxY, item.y, item.y + h);
  });
  const pad = 24;
  const width = Math.max(maxX - minX, 40) + pad * 2;
  const height = Math.max(maxY - minY, 40) + pad * 2;
  return (
    <svg viewBox={`${minX - pad} ${minY - pad} ${width} ${height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" data-seed={index}>
      <g fill="none" stroke="currentColor" strokeWidth={Math.max(width, height) / 160} strokeLinecap="round" strokeLinejoin="round">
        {live.slice(0, 90).map(function (item) {
          const w = item.width || 0; const h = item.height || 0;
          if (item.type === "ellipse") return <ellipse key={item.id} cx={item.x + w / 2} cy={item.y + h / 2} rx={Math.abs(w) / 2} ry={Math.abs(h) / 2} />;
          if (item.type === "diamond") return <path key={item.id} d={`M${item.x + w / 2} ${item.y} L${item.x + w} ${item.y + h / 2} L${item.x + w / 2} ${item.y + h} L${item.x} ${item.y + h / 2}Z`} />;
          if ((item.type === "line" || item.type === "arrow" || item.type === "freedraw") && Array.isArray(item.points) && item.points.length > 1) {
            const d = item.points.map(function (point, i) { return `${i ? "L" : "M"}${item.x + point[0]} ${item.y + point[1]}`; }).join(" ");
            return <path key={item.id} d={d} />;
          }
          if (item.type === "text") return <rect key={item.id} x={item.x} y={item.y + h * 0.35} width={Math.abs(w)} height={Math.max(h * 0.3, 2)} fill="currentColor" stroke="none" opacity=".55" />;
          return <rect key={item.id} x={item.x} y={item.y} width={Math.abs(w)} height={Math.abs(h)} />;
        })}
      </g>
    </svg>
  );
}

function NotesThumb() {
  return (
    <div className="wk-sheet" aria-hidden="true">
      <b /><i /><i /><i style={{ width: "62%" }} /><s /><i /><i style={{ width: "48%" }} />
    </div>
  );
}

function RoomCard({ board, index, noteCount, folders, onOpen, onRename, onDuplicate, onDelete, onStar, onMove }) {
  const isNotes = board.kind === "notes";
  const objects = board.elements ? board.elements.filter(function (item) { return !item.isDeleted; }).length : 0;
  const folder = folders.find(function (item) { return item.id === board.folderId; });

  function pickFolder(folderId) {
    return function () { onMove(folderId); };
  }

  const items = [
    { label: board.starred ? "Remove star" : "Add star", icon: <Star size={15} />, onSelect: onStar },
    { label: "Rename", icon: <Pencil size={15} />, onSelect: onRename },
    { label: "Duplicate", icon: <Copy size={15} />, onSelect: onDuplicate },
    { type: "separator" },
    { type: "heading", label: "Move to folder" },
    { label: "No folder", icon: <FolderInput size={15} />, checked: !board.folderId, onSelect: pickFolder(null) }
  ].concat(folders.map(function (item) {
    return { label: item.name, icon: <Folder size={15} />, checked: board.folderId === item.id, onSelect: pickFolder(item.id) };
  })).concat([
    { type: "separator" },
    { label: "Delete", icon: <Trash2 size={15} />, danger: true, onSelect: onDelete }
  ]);

  function renderTrigger({ toggle, open }) {
    return (
      <button className={`icon-button wk-card-more ${open ? "is-open" : ""}`} type="button" data-menu-trigger onClick={toggle} aria-label={`More options for ${board.title}`} aria-haspopup="menu" aria-expanded={open}>
        <MoreHorizontal size={16} />
      </button>
    );
  }

  return (
    <article className="wk-card">
      <button className="wk-card-open" type="button" onClick={onOpen} aria-label={`Open ${board.title}`}>
        <div className={`wk-thumb ${isNotes ? "is-notes" : ""}`}>
          {isNotes ? <NotesThumb /> : <BoardThumb elements={board.elements || []} index={index} />}
          <span className="wk-type">{isNotes ? <NotebookPen size={11} /> : <PanelsTopLeft size={11} />}{isNotes ? "Notes" : "Board"}</span>
          {board.starred && <span className="wk-star"><Star size={12} fill="currentColor" /></span>}
        </div>
        <div className="wk-card-info">
          <h3>{board.title}</h3>
          <p>
            <span>{formatEdited(board.updatedAt)}</span>
            <i />
            <span>{isNotes ? `${noteCount} ${noteCount === 1 ? "note" : "notes"}` : `${objects} ${objects === 1 ? "object" : "objects"}`}</span>
          </p>
        </div>
      </button>
      <div className="wk-card-foot">
        <span className={`wk-badge ${board.cloudId ? "is-cloud" : ""}`}><span />{board.cloudId ? "Cloud" : "Local"}</span>
        {folder && <span className="wk-badge wk-folder-badge"><Folder size={11} />{folder.name}</span>}
        <Menu renderTrigger={renderTrigger} items={items} width={236} label={`Options for ${board.title}`} />
      </div>
    </article>
  );
}

function NavButton({ active, icon, label, count, onClick }) {
  return (
    <button className={`wk-nav ${active ? "is-active" : ""}`} type="button" onClick={onClick} aria-current={active ? "page" : undefined}>
      {icon}<span>{label}</span>{count !== undefined && <em>{count}</em>}
    </button>
  );
}

function FolderButton({ folder, active, count, onSelect }) {
  function handleClick() { onSelect(active ? "" : folder.id); }
  return (
    <button className={`wk-nav wk-folder ${active ? "is-active" : ""}`} type="button" onClick={handleClick}>
      <Folder size={15} /><span>{folder.name}</span><em>{count}</em>
    </button>
  );
}

export default function Workspace({ guestId, onOpenBoard, onAccountRequired, onBackHome, onSignIn, onSignOut, user }) {
  const { boards: rooms, loading, error } = useBoards(guestId);
  const folders = useFolders(guestId);
  const noteCounts = useRoomNoteCounts(guestId);
  const { isOnline } = useConnectivity();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("boards");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [folderDialog, setFolderDialog] = useState(null);
  const [roomDialog, setRoomDialog] = useState(null);
  const [roomTitle, setRoomTitle] = useState("");
  const [roomDialogBusy, setRoomDialogBusy] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const importInput = useRef(null);

  const visibleBoards = useMemo(() => rooms.filter((board) => {
    const matchesQuery = board.title.toLowerCase().includes(query.trim().toLowerCase());
    const matchesFolder = !selectedFolderId || board.folderId === selectedFolderId;
    const matchesFilter = filter === "all"
      || (filter === "starred" && board.starred)
      || (filter === "boards" && board.kind !== "notes")
      || (filter === "notes" && board.kind === "notes");
    return matchesQuery && matchesFilter && matchesFolder;
  }), [rooms, query, filter, selectedFolderId]);

  const flash = (message) => {
    const text = String(message || "");
    if (/couldn't|could not|can't|failed|need another try/i.test(text)) toast.error(text);
    else toast.success(text);
  };

  const handleCreate = async (kind = "board") => {
    setCreateMenuOpen(false);
    const title = kind === "notes" ? "Untitled notes" : "Untitled board";
    const room = await createBoard(guestId, title, { kind });
    onOpenBoard(room.id);
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const board = await importBoardFile(guestId, file);
      flash("Room imported to this device.");
      onOpenBoard(board.id);
    } catch (cause) {
      flash(friendlyError(cause, "Could not import this file."));
    }
  };

  const handleRename = (board) => {
    setRoomTitle(board.title);
    setRoomDialog({ mode: "rename", roomId: board.id, title: board.title });
  };

  const handleDelete = (board) => {
    setRoomDialog({ mode: "delete", roomId: board.id, title: board.title });
  };

  const handleSaveRoomDialog = async (event) => {
    event.preventDefault();
    if (roomDialogBusy || roomDialog?.mode !== "rename" || !roomTitle.trim()) return;
    setRoomDialogBusy(true);
    try {
      await renameBoard(guestId, roomDialog.roomId, roomTitle);
      setRoomDialog(null);
      flash("Room renamed.");
    } catch (cause) {
      flash(friendlyError(cause, "Could not rename this room."));
    } finally {
      setRoomDialogBusy(false);
    }
  };

  const handleConfirmDeleteRoom = async () => {
    if (roomDialogBusy || roomDialog?.mode !== "delete") return;
    setRoomDialogBusy(true);
    try {
      await deleteBoard(guestId, roomDialog.roomId);
      setRoomDialog(null);
      flash("Room deleted.");
    } catch (cause) {
      flash(friendlyError(cause, "Could not delete this room."));
    } finally {
      setRoomDialogBusy(false);
    }
  };

  const handleDuplicate = async (board) => {
    await duplicateBoard(guestId, board.id);
    flash("A copy was added to your rooms.");
  };

  const handleCreateFolder = () => {
    setFolderName("");
    setFolderDialog({ mode: "create" });
  };

  const handleManageFolder = () => {
    const folder = folders.find((item) => item.id === selectedFolderId);
    if (!folder) return;
    setFolderName(folder.name);
    setFolderDialog({ mode: "manage", folderId: folder.id, folderName: folder.name });
  };

  const handleSaveFolder = async (event) => {
    event.preventDefault();
    if (folderBusy || !folderName.trim()) return;
    setFolderBusy(true);
    try {
      if (folderDialog?.mode === "create") {
        const folder = await createFolder(guestId, folderName);
        setSelectedFolderId(folder.id);
        flash(`Folder “${folder.name}” created.`);
      } else if (folderDialog?.mode === "manage") {
        await renameFolder(guestId, folderDialog.folderId, folderName);
        flash("Folder renamed.");
      }
      setFolderDialog(null);
    } catch (cause) {
      flash(friendlyError(cause, "Could not save this folder."));
    } finally {
      setFolderBusy(false);
    }
  };

  const handleDeleteFolder = async () => {
    if (folderBusy || folderDialog?.mode !== "manage") return;
    setFolderBusy(true);
    try {
      await deleteFolder(guestId, folderDialog.folderId);
      setSelectedFolderId("");
      setFolderDialog(null);
      flash("Folder deleted. Your rooms are still in the library.");
    } catch (cause) {
      flash(friendlyError(cause, "Could not delete this folder."));
    } finally {
      setFolderBusy(false);
    }
  };

  const handleMigrateLocalRooms = async () => {
    const localRooms = rooms.filter((room) => !room.cloudId);
    if (!localRooms.length || migrationBusy) return;
    setMigrationBusy(true);
    let migrated = 0;
    let failed = 0;
    for (const room of localRooms) {
      try {
        const [notes, projectItems] = await Promise.all([
          listRoomNotes(guestId, room.id),
          listRoomProjectItems(guestId, room.id)
        ]);
        const result = await createCloudBoard({
          title: room.title,
          kind: room.kind || "board",
          sourceLocalId: room.id,
          scene: { elements: room.elements || [], appState: room.appState || {}, files: room.files || {}, designStudio: room.designStudio || { tokens: [], components: [] } },
          notes,
          projectItems
        });
        await setBoardCloudLink(guestId, room.id, result.board.id);
        migrated += 1;
      } catch (cause) {
        failed += 1;
        console.error(`Could not migrate room ${room.title}:`, cause);
      }
    }
    setMigrationBusy(false);
    flash(failed ? `${migrated} rooms synced. ${failed} need another try.` : `${migrated} local rooms are now in your cloud workspace.`);
  };

  const filterTitles = { boards: "Boards", notes: "Notes", starred: "Starred", all: "All rooms" };
  const selectedFolder = folders.find(function (item) { return item.id === selectedFolderId; });
  const heading = selectedFolder ? selectedFolder.name : filterTitles[filter];
  const localCount = rooms.filter(function (room) { return !room.cloudId; }).length;
  const boardCount = rooms.filter(function (room) { return room.kind !== "notes"; }).length;
  const notesCount = rooms.filter(function (room) { return room.kind === "notes"; }).length;
  const starredCount = rooms.filter(function (room) { return room.starred; }).length;

  function selectAll() { setFilter("all"); setSelectedFolderId(""); }
  function selectBoards() { setFilter("boards"); setSelectedFolderId(""); }
  function selectNotes() { setFilter("notes"); setSelectedFolderId(""); }
  function selectStarred() { setFilter("starred"); setSelectedFolderId(""); }
  function createBoardRoom() { handleCreate("board"); }
  function createNotesRoom() { handleCreate("notes"); }
  function openImport() { importInput.current?.click(); }
  function handleQuery(event) { setQuery(event.target.value); }
  function clearQuery() { setQuery(""); }
  function closeRoomDialog() { setRoomDialog(null); }
  function closeFolderDialog() { setFolderDialog(null); }
  function handleRoomTitle(event) { setRoomTitle(event.target.value); }
  function handleFolderName(event) { setFolderName(event.target.value); }
  function backdropRoom(event) { if (event.target === event.currentTarget && !roomDialogBusy) setRoomDialog(null); }
  function backdropFolder(event) { if (event.target === event.currentTarget && !folderBusy) setFolderDialog(null); }
  function roomMoveHandler(board) {
    return function (folderId) { moveRoomToFolder(guestId, board.id, folderId).then(function () { flash("Room moved."); }); };
  }
  function roomHandler(fn, board) { return function () { fn(board); }; }
  function openRoomHandler(board) { return function () { onOpenBoard(board.id); }; }
  function starHandler(board) { return function () { toggleBoardStar(guestId, board.id); }; }
  function folderCount(folder) { return rooms.filter(function (room) { return room.folderId === folder.id; }).length; }

  const createItems = [
    { type: "heading", label: "New room" },
    { label: "Board", icon: <PanelsTopLeft size={15} />, onSelect: createBoardRoom },
    { label: "Notes", icon: <NotebookPen size={15} />, onSelect: createNotesRoom },
    { type: "separator" },
    { label: "New folder", icon: <FolderPlus size={15} />, onSelect: handleCreateFolder },
    { label: "Import file", icon: <Upload size={15} />, onSelect: openImport }
  ];

  const userItems = user ? [
    { type: "heading", label: user.email || "Signed in" },
    { label: "Sign out", icon: <LogOut size={15} />, onSelect: onSignOut },
    { label: "Back to home", icon: <ArrowUpRight size={15} />, onSelect: onBackHome }
  ] : [
    { type: "heading", label: "Guest space" },
    { label: "Sign in", icon: <LogIn size={15} />, onSelect: onSignIn },
    { label: "Back to home", icon: <ArrowUpRight size={15} />, onSelect: onBackHome }
  ];

  function renderCreate({ toggle, open }) {
    return <button className="primary-button wk-new" type="button" data-menu-trigger onClick={toggle} aria-haspopup="menu" aria-expanded={open}><Plus size={16} /> New<ChevronsUpDown size={13} className="wk-new-chev" /></button>;
  }
  function renderUser({ toggle, open }) {
    return (
      <button className="wk-user" type="button" data-menu-trigger onClick={toggle} aria-haspopup="menu" aria-expanded={open}>
        <span className="wk-avatar">{(user?.name || user?.email || "G").slice(0, 1).toUpperCase()}</span>
        <span className="wk-user-text"><strong>{user?.name || "Guest"}</strong><small>{user ? "Signed in" : "Saved on this device"}</small></span>
        <ChevronsUpDown size={14} />
      </button>
    );
  }

  return (
    <main className="wk">
      <aside className="wk-side">
        <button className="brand-lockup wk-brand" type="button" onClick={onBackHome}><ArcMark /><span>arcdraw</span></button>
        <Menu renderTrigger={renderCreate} items={createItems} align="start" width={232} label="Create" />
        <input ref={importInput} className="visually-hidden" type="file" accept=".excalidraw,.json,application/json" onChange={handleImport} />

        <nav className="wk-nav-group" aria-label="Library">
          <p className="wk-group-title">Library</p>
          <NavButton active={filter === "all" && !selectedFolderId} icon={<LayoutGrid size={16} />} label="All rooms" count={rooms.length} onClick={selectAll} />
          <NavButton active={filter === "boards" && !selectedFolderId} icon={<PanelsTopLeft size={16} />} label="Boards" count={boardCount} onClick={selectBoards} />
          <NavButton active={filter === "notes" && !selectedFolderId} icon={<NotebookPen size={16} />} label="Notes" count={notesCount} onClick={selectNotes} />
          <NavButton active={filter === "starred" && !selectedFolderId} icon={<Star size={16} />} label="Starred" count={starredCount} onClick={selectStarred} />
        </nav>

        <nav className="wk-nav-group wk-folders" aria-label="Folders">
          <div className="wk-group-row">
            <p className="wk-group-title">Folders</p>
            <button className="wk-mini" type="button" onClick={handleCreateFolder} aria-label="New folder" data-tip="New folder"><Plus size={14} /></button>
          </div>
          {folders.length === 0 && <p className="wk-empty-note">No folders yet.</p>}
          {folders.map(function (folder) {
            return <FolderButton key={folder.id} folder={folder} active={selectedFolderId === folder.id} count={folderCount(folder)} onSelect={setSelectedFolderId} />;
          })}
        </nav>

        <div className="wk-side-foot">
          <div className="wk-status">
            <span className={`wk-conn ${isOnline ? "is-online" : ""}`}>{isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}{isOnline ? "Online" : "Offline"}</span>
            <ThemeToggle compact />
          </div>
          <Menu renderTrigger={renderUser} items={userItems} align="start" side="top" width={232} label="Account" />
        </div>
      </aside>

      <section className="wk-main">
        <header className="wk-head">
          <div>
            <p className="kicker">{selectedFolder ? "Folder" : "Workspace"}</p>
            <h1>{heading}</h1>
          </div>
          <div className="wk-head-tools">
            <label className="wk-search">
              <Search size={15} />
              <input value={query} onChange={handleQuery} placeholder="Search rooms" aria-label="Search rooms" />
              {query && <button type="button" onClick={clearQuery} aria-label="Clear search"><X size={13} /></button>}
            </label>
            {selectedFolder && <button className="secondary-button" type="button" onClick={handleManageFolder}><Settings2 size={15} /> Manage</button>}
            {!user && <button className="primary-button wk-signin-tab" type="button" onClick={onSignIn}><LogIn size={15} /> Sign in</button>}
          </div>
        </header>

        {user && localCount > 0 && (
          <section className="wk-banner">
            <CloudUpload size={18} />
            <div><strong>Bring your local rooms to every device</strong><span>Move boards, notes and project data into your cloud workspace. Local copies stay available.</span></div>
            <button className="primary-button" type="button" onClick={handleMigrateLocalRooms} disabled={migrationBusy}>{migrationBusy ? "Syncing…" : `Sync ${localCount} ${localCount === 1 ? "room" : "rooms"}`}</button>
          </section>
        )}

        {loading ? (
          <div className="wk-empty"><div className="loading-line" /><p>Opening your workspace</p></div>
        ) : error ? (
          <div className="wk-empty"><h2>We could not read your rooms.</h2><p>{error}</p></div>
        ) : visibleBoards.length ? (
          <div className="wk-grid">
            {visibleBoards.map(function (board, index) {
              return (
                <RoomCard
                  key={board.id}
                  board={board}
                  index={index}
                  noteCount={noteCounts[board.id] || 0}
                  folders={folders}
                  onOpen={openRoomHandler(board)}
                  onRename={roomHandler(handleRename, board)}
                  onDuplicate={roomHandler(handleDuplicate, board)}
                  onDelete={roomHandler(handleDelete, board)}
                  onStar={starHandler(board)}
                  onMove={roomMoveHandler(board)}
                />
              );
            })}
          </div>
        ) : query || filter === "starred" || selectedFolderId ? (
          <div className="wk-empty"><span className="wk-empty-icon"><Search size={20} /></span><h2>Nothing here.</h2><p>Try another search or pick a different view.</p></div>
        ) : (
          <div className="wk-empty wk-empty-start">
            <span className="wk-empty-icon">{filter === "notes" ? <NotebookPen size={22} /> : <PanelsTopLeft size={22} />}</span>
            <h2>{filter === "notes" ? "Start with a note." : "Start with a thought."}</h2>
            <p>{filter === "notes" ? "A calm place for decisions, research and checklists." : "An infinite canvas for flows, systems and loose ideas."}</p>
            {filter === "notes"
              ? <button className="primary-button" type="button" onClick={createNotesRoom}><NotebookPen size={16} /> Create notes</button>
              : <button className="primary-button" type="button" onClick={createBoardRoom}><PanelsTopLeft size={16} /> Create board</button>}
          </div>
        )}

        <footer className="wk-foot"><span><i /> Saved on this device</span><span>Private by default</span></footer>
      </section>

      {roomDialog && roomDialog.mode === "rename" && (
        <Drawer
          size="sm" title="Rename" subtitle="Give this room a new name" icon={<Pencil size={20} strokeWidth={1.8} />}
          busy={roomDialogBusy} onClose={closeRoomDialog}
          footer={({ close }) => (
            <>
              <button className="secondary-button" type="button" onClick={close} disabled={roomDialogBusy}>Cancel</button>
              <button className="primary-button" type="button" onClick={handleSaveRoomDialog} disabled={roomDialogBusy || !roomTitle.trim()}>{roomDialogBusy ? "Saving…" : "Save name"}</button>
            </>
          )}
        >
          <form onSubmit={handleSaveRoomDialog}>
            <input className="drawer-input" data-autofocus maxLength={100} value={roomTitle} onChange={handleRoomTitle} placeholder="Room name" aria-label="Room name" />
          </form>
        </Drawer>
      )}

      {roomDialog && roomDialog.mode === "delete" && (
        <Drawer
          size="sm" title="Delete room" subtitle={roomDialog.title} icon={<Trash2 size={20} strokeWidth={1.8} />}
          busy={roomDialogBusy} onClose={closeRoomDialog}
          footer={({ close }) => (
            <>
              <button className="secondary-button" type="button" onClick={close} disabled={roomDialogBusy}>Keep it</button>
              <button className="primary-button danger-button" type="button" onClick={handleConfirmDeleteRoom} disabled={roomDialogBusy}>{roomDialogBusy ? "Deleting…" : "Delete"}</button>
            </>
          )}
        >
          <div className="drawer-note">Removes this room, its notes and tasks from this device. Cloud copies stay with collaborators.</div>
        </Drawer>
      )}

      {folderDialog && (
        <Drawer
          size="sm" title={folderDialog.mode === "create" ? "New folder" : "Manage folder"} subtitle={folderDialog.mode === "create" ? "Group related rooms" : "Rooms inside are kept"} icon={<FolderPlus size={20} strokeWidth={1.8} />}
          busy={folderBusy} onClose={closeFolderDialog}
          footer={({ close }) => (
            <>
              {folderDialog.mode === "manage" && <button className="secondary-button wk-danger-text" type="button" onClick={handleDeleteFolder} disabled={folderBusy}><Trash2 size={15} /> Delete</button>}
              <span className="wk-spacer" />
              <button className="secondary-button" type="button" onClick={close} disabled={folderBusy}>Cancel</button>
              <button className="primary-button" type="button" onClick={handleSaveFolder} disabled={folderBusy || !folderName.trim()}>{folderBusy ? "Saving…" : folderDialog.mode === "create" ? "Create" : "Save"}</button>
            </>
          )}
        >
          <form onSubmit={handleSaveFolder}>
            <input className="drawer-input" data-autofocus maxLength={64} value={folderName} onChange={handleFolderName} placeholder="Folder name" aria-label="Folder name" />
          </form>
        </Drawer>
      )}
    </main>
  );
}
