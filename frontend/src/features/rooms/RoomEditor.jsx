import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, Footer, MainMenu, exportToBlob, sceneCoordsToViewportCoords } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import {
  ArrowLeft, Check, ChevronDown, Download, FileJson, FileText, GitCommit, History,
  Image, StickyNote, LoaderCircle, MoreHorizontal, Share2, Wifi, WifiOff, CloudUpload, ListTodo, Sparkles, PanelsTopLeft,
  Moon, Sun, Pencil, Presentation, MousePointer2, Hand, Square, Diamond, Circle, MoveUpRight, Minus, PenLine, Type, ImagePlus, Eraser, Layers,
  SquareKanban, WandSparkles, Palette, Frame, Brush, MessageCircle, Grid3x3, Trash2, GitPullRequest, GitMerge, SlidersHorizontal, Zap
} from "lucide-react";
import Drawer from "../../components/Drawer.jsx";
import Menu from "../../components/Menu.jsx";
import {
  createBoard, findBoardByCloudId, getBoard, getExportPayload,
  renameBoard, setBoardCloudLink, updateBoardScene, updateBoardDesignStudio
} from "../../database/boardService.js";
import { downloadBlob, safeFilename } from "../../utils/download.js";
import { useNotes } from "../../database/useNotes.js";
import { listRoomNotes } from "../../database/noteService.js";
import { createRoomNote, updateRoomNote, deleteRoomNote, replaceRoomNotes } from "../../database/noteService.js";
import { listRoomProjectItems, saveRoomProjectItem, deleteRoomProjectItem, mergeRoomProjectItems } from "../../database/projectService.js";
import RoomNotesPanel from "../notes/RoomNotesPanel.jsx";
import RoomProjectPanel from "./RoomProjectPanel.jsx";
import RoomAgentPanel from "./RoomAgentPanel.jsx";
import RoomDesignPanel from "./RoomDesignPanel.jsx";
import ThemeToggle from "../../components/ThemeToggle.jsx";
import { useTheme } from "../../theme/ThemeContext.jsx";
import { useConnectivity } from "../../offline/useConnectivity.js";
import { ACCOUNT_REQUIRED_ACTIONS } from "../../guest/accountGate.js";
import { useBoardCollaboration } from "../../realtime/useBoardCollaboration.js";
import {
  createCloudBoard, createShareLink, createBoardCommit, restoreBoardCommit,
  getSharedBoard, renameCloudBoard, updateBoardSettings, listProposals
} from "../../services/boardCloudService.js";
import { toast } from "../../components/toast/toastStore.js";
import { friendlyError } from "../../utils/errors.js";
import ModeDrawer from "../collaboration/ModeDrawer.jsx";
import ReviewDrawer from "../collaboration/ReviewDrawer.jsx";
import ShareDialog from "../collaboration/ShareDialog.jsx";
import CommitDialog from "../collaboration/CommitDialog.jsx";
import HistoryDrawer from "../collaboration/HistoryDrawer.jsx";
import DiscussionPanel from "../collaboration/DiscussionPanel.jsx";
import "../../collaboration.css";

const EXCALIDRAW_UI_OPTIONS = Object.freeze({
  canvasActions: Object.freeze({
    loadScene: false,
    saveToActiveFile: false,
    export: false,
    saveAsImage: false
  })
});

// Arcdraw draws clean, precise shapes with a rounded UI font, not the hand-drawn
// Excalidraw look. These apply to NEW shapes, once per room.
const CLEAN_DEFAULTS = Object.freeze({
  currentItemRoughness: 0,
  currentItemFontFamily: 6,
  currentItemRoundness: "round",
  currentItemStrokeWidth: 2,
  currentItemFillStyle: "solid"
});
const styleKey = (id) => `arcdraw:style-v2:${id}`;
const GRID_KEY = "arcdraw:grid";
function readGridPreference() {
  try { return window.localStorage.getItem(GRID_KEY) === "1"; } catch { return false; }
}
function withCleanDefaults(appState, boardId) {
  try {
    if (boardId && !window.localStorage.getItem(styleKey(boardId))) {
      window.localStorage.setItem(styleKey(boardId), "1");
      return { ...appState, ...CLEAN_DEFAULTS };
    }
  } catch {
    // Storage can be unavailable; the defaults simply apply again next time.
  }
  return appState;
}

function getInitialScene(board) {
  const savedAppState = withCleanDefaults({ ...(board.appState || {}) }, board.id);
  // Let Excalidraw choose its theme-aware default background. Preserve any
  // intentionally selected custom canvas color from the saved scene.
  if (["#ffffff", "#fff", undefined, null].includes(savedAppState.viewBackgroundColor)) {
    delete savedAppState.viewBackgroundColor;
  }
  delete savedAppState.theme;
  return {
    elements: board.elements || [],
    appState: {
      ...savedAppState,
      gridModeEnabled: readGridPreference(),
      gridSize: 20,
      zoom: { value: Number(board.appState?.zoom) || 1 }
    },
    files: board.files || {}
  };
}

function cursorColor(userId = "") {
  const palette = ["#0a0a0a", "#4a4a4a", "#7a7a7a", "#2b2b2b", "#636363", "#9a9a9a"];
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function inferComponentProperties(elements = []) {
  const properties = [];
  let textIndex = 0, colorIndex = 0, visibilityIndex = 0;
  for (const element of elements) {
    if (element.type === "text") {
      textIndex += 1;
      properties.push({ id: `text-${element.id}`, name: textIndex === 1 ? "Text" : `Text ${textIndex}`, type: "text", target: "text", sourceElementId: element.id, defaultValue: element.text || element.originalText || "" });
    } else if (!["image", "frame", "magicframe", "embeddable", "iframe"].includes(element.type)) {
      colorIndex += 1;
      properties.push({ id: `fill-${element.id}`, name: colorIndex === 1 ? "Fill color" : `Fill color ${colorIndex}`, type: "color", target: "backgroundColor", sourceElementId: element.id, defaultValue: element.backgroundColor && element.backgroundColor !== "transparent" ? element.backgroundColor : "#ffffff" });
    }
    if (element.type !== "image" && element.type !== "frame") {
      visibilityIndex += 1;
      properties.push({ id: `visible-${element.id}`, name: visibilityIndex === 1 ? "Visible" : `Visible ${visibilityIndex}`, type: "boolean", target: "isDeleted", sourceElementId: element.id, defaultValue: true });
    }
  }
  return properties.slice(0, 40);
}

export default function RoomEditor({ guestId, boardId, shareToken = null, onBack, onAccountRequired, user, isAuthenticated = false }) {
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editorReady, setEditorReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [saveStatus, setSaveStatus] = useState("saved");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [cloudSaveBusy, setCloudSaveBusy] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitBusy, setCommitBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [modeOpen, setModeOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const [myPending, setMyPending] = useState(false);
  const [reviewRefresh, setReviewRefresh] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const lastSignature = useRef("");
  const roleRef = useRef("owner");
  const [rightPanel, setRightPanel] = useState(null);
  const [focusNoteId, setFocusNoteId] = useState(null);
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [projectItems, setProjectItems] = useState([]);
  const [designStudio, setDesignStudio] = useState({ tokens: [], components: [] });
  const [discussion, setDiscussion] = useState({ messages: [], comments: [] });
  const [selectedElementIds, setSelectedElementIds] = useState([]);
  const [presentationMode, setPresentationMode] = useState(false);
  const [activeToolType, setActiveToolType] = useState("selection");
  const [clearOpen, setClearOpen] = useState(false);
  const [gridOn, setGridOn] = useState(readGridPreference);
  const apiRef = useRef(null);
  // Keep every hook above the loading/error early returns.
  // The image picker ref is used by toolbar actions after the room loads.
  const imageInputRef = useRef(null);
  const saveTimer = useRef(null);
  const pendingScene = useRef(null);
  const pointerAreaRef = useRef(null);
  const notesPanelRef = useRef(null);
  const { isOnline } = useConnectivity();
  const { theme, toggleTheme } = useTheme();

  // Excalidraw registers this callback in an effect. Keep it stable: an inline
  // callback is recreated on every RoomEditor render, causing Excalidraw to
  // unregister/register the API repeatedly and, in some releases, loop state
  // updates until React hits Maximum update depth.
  const handleExcalidrawAPI = useCallback((api) => {
    apiRef.current = api || null;
    const ready = Boolean(api);
    setEditorReady((current) => current === ready ? current : ready);
  }, []);

  const localBoardId = board?.id || boardId;
  const effectiveShareToken = board?.shareToken || shareToken || null;
  const cloudBoardId = board?.cloudId || null;
  const [remoteSceneQueue, setRemoteSceneQueue] = useState(null);
  const { notes, loading: notesLoading } = useNotes(guestId, localBoardId);
  // initialData is only for the initial mount. Keep its reference stable while
  // the live scene changes; remote updates are applied through updateScene.
  const excalidrawInitialData = useMemo(
    () => board ? getInitialScene(board) : undefined,
    [board?.id]
  );

  const applyRemoteScene = useCallback((scene) => {
    if (!scene) return;
    setRemoteSceneQueue(scene);
    if (localBoardId && guestId) {
      void updateBoardScene(guestId, localBoardId, scene).catch((error) => console.error("Remote scene local cache failed:", error));
    }
    setBoard((current) => current ? {
      ...current,
      elements: scene.elements,
      appState: scene.appState,
      files: scene.files,
      updatedAt: new Date().toISOString()
    } : current);
  }, [guestId, localBoardId]);

  const applyRemoteNotes = useCallback((remoteNotes) => {
    if (!guestId || !localBoardId) return;
    void replaceRoomNotes(guestId, localBoardId, remoteNotes).catch((error) => {
      console.error("Remote notes local cache failed:", error);
    });
  }, [guestId, localBoardId]);

  const applyRemoteProjectItems = useCallback((remoteItems) => {
    if (!guestId || !localBoardId) return;
    void mergeRoomProjectItems(guestId, localBoardId, remoteItems).then(setProjectItems).catch((error) => {
      console.error("Remote project data local cache failed:", error);
    });
  }, [guestId, localBoardId]);

  const applyRemoteDesignStudio = useCallback((remoteStudio) => {
    const safe = {
      tokens: Array.isArray(remoteStudio?.tokens) ? remoteStudio.tokens : [],
      components: Array.isArray(remoteStudio?.components) ? remoteStudio.components : []
    };
    setDesignStudio(safe);
    if (guestId && localBoardId) void updateBoardDesignStudio(guestId, localBoardId, safe).catch((error) => console.error("Remote design studio cache failed:", error));
  }, [guestId, localBoardId]);

  function handleModeChange(next) {
    // The owner already saw a confirmation when they changed it.
    if (roleRef.current === "owner") return;
    if (next === "commit") toast.info("The owner turned on commit mode.", { description: "Your edits now stay private until you submit them for review." });
    else toast.info("The owner turned on live editing.", { description: "Everyone edits the room together again." });
  }

  function handleProposalEvent(type, payload) {
    const proposal = payload?.proposal;
    if (!proposal) return;
    setReviewRefresh(function (value) { return value + 1; });
    const mine = proposal.author?.id === user?.id;
    if (type === "new" && roleRef.current === "owner") {
      toast.info((proposal.author?.name || "Someone") + " submitted changes.", {
        description: proposal.message,
        duration: 9000,
        action: { label: "Review", onClick: function () { setReviewOpen(true); } }
      });
    }
    if (type === "resolved" && mine) {
      if (proposal.status === "accepted") toast.success("Your changes were merged into the room.");
      if (proposal.status === "rejected") {
        toast.warning("The owner declined your changes.", {
          description: proposal.note || "You can keep editing and submit again, or discard your draft.",
          duration: 12000
        });
      }
    }
  }

  const collab = useBoardCollaboration({
    boardId: cloudBoardId,
    localUserId: user?.id,
    shareToken: effectiveShareToken,
    roleHint: board?.permission || null,
    initialWorkMode: board?.workMode || "live",
    onModeChange: handleModeChange,
    onProposalEvent: handleProposalEvent,
    initialScene: board || undefined,
    initialNotes: notes,
    initialProjectItems: projectItems,
    initialDesignStudio: designStudio,
    enabled: Boolean(isAuthenticated && cloudBoardId && user?.id),
    onRemoteScene: applyRemoteScene,
    onRemoteNotes: applyRemoteNotes,
    onRemoteProjectItems: applyRemoteProjectItems,
    onRemoteDesignStudio: applyRemoteDesignStudio,
    onRemoteDiscussion: setDiscussion
  });

  const isOwner = collab.status === "connected" ? collab.role === "owner" : !board?.permission;
  roleRef.current = isOwner ? "owner" : collab.role;
  const inDraft = collab.draftState === "draft";
  const draftTotal = collab.draftSummary?.total || 0;

  // Owner: how many requests wait. Editor: do I already have one waiting.
  useEffect(function () {
    if (!cloudBoardId || collab.status !== "connected" || collab.role === "viewer" || collab.role === "revoked") return undefined;
    let active = true;
    listProposals(cloudBoardId, { shareToken: effectiveShareToken, status: "pending" })
      .then(function (result) {
        if (!active) return;
        if (collab.role === "owner") setReviewCount(result.pendingCount ?? result.proposals.length);
        else setMyPending(result.proposals.length > 0);
      })
      .catch(function () { /* the badge is a convenience, never block the room on it */ });
    return function () { active = false; };
  }, [cloudBoardId, collab.status, collab.role, collab.workMode, effectiveShareToken, reviewRefresh]);

  useEffect(() => {
    if (cloudBoardId && isAuthenticated && collab.status !== "idle" && collab.role !== "viewer" && board?.permission !== "viewer" && !notesLoading) {
      collab.publishNotes(notes);
    }
  }, [cloudBoardId, isAuthenticated, collab.status, collab.role, board?.permission, collab.publishNotes, notes, notesLoading]);


  useEffect(() => {
    let active = true;
    setLoading(true);
    setBoard(null);
    lastSignature.current = "";
    setLoadError("");

    const load = async () => {
      if (shareToken) {
        if (!isAuthenticated) throw new Error("Sign in to open this shared room.");
        const remote = await getSharedBoard(shareToken);
        let local = await findBoardByCloudId(guestId, remote.board.id);
        if (!local) {
          local = await createBoard(guestId, remote.board.title, { ...remote.scene, kind: remote.board.kind || "board" });
        }
        await mergeRoomProjectItems(guestId, local.id, remote.scene.projectItems || []);
        await setBoardCloudLink(guestId, local.id, remote.board.id, shareToken, remote.board.role);
        await replaceRoomNotes(guestId, local.id, remote.scene.notes || []);
        return {
          ...local,
          title: remote.board.title,
          kind: remote.board.kind || local.kind || "board",
          cloudId: remote.board.id,
          shareToken,
          permission: remote.board.role,
          workMode: remote.board.workMode || "live",
          elements: local.elements?.length ? local.elements : remote.scene.elements,
          files: Object.keys(local.files || {}).length ? local.files : remote.scene.files,
          appState: local.appState || remote.scene.appState
        };
      }
      const local = await getBoard(guestId, boardId);
      if (!local) throw new Error("This room doesn't exist in this guest workspace.");
      return local;
    };

    load()
      .then(async (result) => {
        const storedProjectItems = await listRoomProjectItems(guestId, result.id);
        if (!active) return;
        setProjectItems(storedProjectItems);
        setDesignStudio({ tokens: result.designStudio?.tokens || [], components: result.designStudio?.components || [] });
        setBoard(result);
        setTitleDraft(result.title);
        setRightPanel(null);
      })
      .catch((error) => active && setLoadError(error.message || "Could not open this room."))
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [guestId, boardId, shareToken, isAuthenticated]);

  useLayoutEffect(() => {
    if (!remoteSceneQueue || !apiRef.current) return;
    const api = apiRef.current;
    api.updateScene({
      elements: remoteSceneQueue.elements || [],
      appState: {
        viewBackgroundColor: remoteSceneQueue.appState?.viewBackgroundColor || "#ffffff",
        gridSize: remoteSceneQueue.appState?.gridSize ?? null
      }
    });
    if (Object.keys(remoteSceneQueue.files || {}).length && typeof api.addFiles === "function") {
      api.addFiles(Object.values(remoteSceneQueue.files));
    }
    setRemoteSceneQueue(null);
  }, [remoteSceneQueue, editorReady]);

  const flushSave = useCallback(async () => {
    const scene = pendingScene.current;
    if (!scene || !guestId || !localBoardId) { setSaveStatus("saved"); return; }
    pendingScene.current = null;
    try {
      await updateBoardScene(guestId, localBoardId, scene);
      setSaveStatus("saved");
      toast.dismiss("local-save");
      setBoard((current) => current ? {
        ...current,
        elements: scene.elements,
        appState: scene.appState,
        files: scene.files,
        updatedAt: new Date().toISOString()
      } : current);
      // Images travel inside the room, so warn before sync hits its size limit.
      if (cloudBoardId) {
        let bytes = 0;
        for (const file of Object.values(scene.files || {})) bytes += (file?.dataURL || "").length * 0.75;
        if (bytes > 6.5 * 1024 * 1024) toast.error("This room is over the 7 MB sync limit. Remove or shrink some images.", { id: "room-size", duration: 9000 });
        else if (bytes > 5 * 1024 * 1024) toast.warning("This room is close to the 7 MB sync limit. Large images may stop syncing.", { id: "room-size" });
      }
    } catch (error) {
      console.error("Local board save failed:", error);
      setSaveStatus("error");
      pendingScene.current = scene;
      toast.error(friendlyError(error, "Couldn't save on this device."), {
        id: "local-save",
        duration: null,
        action: { label: "Retry", onClick: function () { void flushSave(); } }
      });
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => { void flushSave(); }, 5000);
    }
  }, [guestId, localBoardId, cloudBoardId]);

  const handlePointerUpdate = useCallback((payload) => {
    const pointer = payload?.pointer || payload;
    if (pointer) collab.broadcastPointer(pointer);
  }, [collab.broadcastPointer]);

  const handleChange = useCallback((elements, appState, files) => {
    // Excalidraw's onChange array can omit deleted objects in some flows.
    // Include tombstones so the CRDT replica can propagate deletions safely.
    const completeElements = apiRef.current?.getSceneElementsIncludingDeleted?.() || elements;
    const scene = { elements: completeElements, appState, files };
    const selectedIds = appState?.selectedElementIds || {};
    const selectedId = Object.keys(selectedIds).find((id) => selectedIds[id]) || null;
    const toolType = appState?.activeTool?.type || "selection";
    setActiveToolType((current) => current === toolType ? current : toolType);
    setSelectedElementId((current) => current === selectedId ? current : selectedId);
    const nextSelectedIds = Object.keys(selectedIds).filter((id) => selectedIds[id]);
    // Excalidraw can call onChange after a parent-driven update. Returning the
    // previous array for an unchanged selection prevents a parent <-> canvas
    // render loop (and avoids rerendering the room for every canvas update).
    setSelectedElementIds((current) => (
      current.length === nextSelectedIds.length && current.every((id, index) => id === nextSelectedIds[index])
        ? current
        : nextSelectedIds
    ));
    // Excalidraw calls onChange after every render, including the render caused
    // by our own save. Only continue when the drawing really changed. Without
    // this, saving triggers a render, which triggers a save, forever. That loop
    // froze the editor as soon as a picture was added.
    let versionSum = 0;
    let nonceSum = 0;
    for (const element of completeElements) { versionSum += element.version || 0; nonceSum += element.versionNonce || 0; }
    let filePayloadSignature = 2166136261;
    for (const [fileId, file] of Object.entries(files || {})) {
      const payload = String(file?.dataURL || "");
      const material = `${fileId}:${file?.mimeType || ""}:${payload.length}:${payload.slice(0, 96)}:${payload.slice(-96)}`;
      for (let index = 0; index < material.length; index += 1) {
        filePayloadSignature ^= material.charCodeAt(index);
        filePayloadSignature = Math.imul(filePayloadSignature, 16777619);
      }
    }
    const signature = [
      completeElements.length, versionSum, nonceSum, Object.keys(files || {}).join(","), filePayloadSignature,
      appState?.viewBackgroundColor, appState?.gridSize, appState?.zoom?.value,
      Math.round(appState?.scrollX || 0), Math.round(appState?.scrollY || 0)
    ].join("|");
    if (signature === lastSignature.current) return;
    const firstChange = lastSignature.current === "";
    lastSignature.current = signature;
    if (firstChange) return;
    pendingScene.current = scene;
    if (cloudBoardId && collab.role !== "viewer") collab.publishScene(scene);
    setSaveStatus("saving");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void flushSave(); }, 350);
  }, [cloudBoardId, collab.publishScene, collab.role, flushSave]);

  useEffect(() => () => {
    window.clearTimeout(saveTimer.current);
    const scene = pendingScene.current;
    if (scene && guestId && localBoardId) {
      void updateBoardScene(guestId, localBoardId, scene).catch((error) => console.error("Final local save failed:", error));
    }
  }, [guestId, localBoardId]);

  const getLiveScene = () => {
    if (!apiRef.current) return { ...(board || {}), designStudio };
    return {
      elements: apiRef.current.getSceneElementsIncludingDeleted(),
      appState: apiRef.current.getAppState(),
      files: apiRef.current.getFiles(),
      designStudio
    };
  };

  const saveDesignStudio = async (nextStudio) => {
    const safe = {
      tokens: Array.isArray(nextStudio?.tokens) ? nextStudio.tokens.slice(0, 100) : [],
      components: Array.isArray(nextStudio?.components) ? nextStudio.components.slice(0, 100) : []
    };
    setDesignStudio(safe);
    await updateBoardDesignStudio(guestId, localBoardId, safe);
    if (cloudBoardId && collab.role !== "viewer" && board?.permission !== "viewer") collab.publishDesignStudio(safe);
    flash("Design library saved.");
  };

  const updateCanvasElements = (nextElements, appState = undefined) => {
    if (!apiRef.current || readOnly) return;
    apiRef.current.updateScene({ elements: nextElements, ...(appState ? { appState } : {}) });
  };

  const moveCanvasLayer = (elementId, direction) => {
    if (!apiRef.current || readOnly) return;
    const scene = apiRef.current.getSceneElementsIncludingDeleted();
    const currentIndex = scene.findIndex((element) => element.id === elementId);
    if (currentIndex < 0) return;
    const targetIndex = Math.max(0, Math.min(scene.length - 1, currentIndex + (direction === "up" ? 1 : -1)));
    if (targetIndex === currentIndex) return;
    const next = [...scene];
    const [element] = next.splice(currentIndex, 1);
    next.splice(targetIndex, 0, element);
    apiRef.current.updateScene({ elements: next });
  };

  const renameFrame = (frame, nextName) => {
    if (!apiRef.current || readOnly) return;
    const cleanName = String(nextName || "").trim().slice(0, 80);
    if (!cleanName) return;
    const scene = apiRef.current.getSceneElementsIncludingDeleted();
    apiRef.current.updateScene({ elements: scene.map((element) => element.id === frame.id ? {
      ...element,
      customData: { ...(element.customData || {}), frameName: cleanName },
      version: (element.version || 0) + 1,
      versionNonce: Math.floor(Math.random() * 2147483647),
      updated: Date.now()
    } : element) });
  };

  const deleteFrame = (frame) => {
    if (!apiRef.current || readOnly) return;
    const scene = apiRef.current.getSceneElementsIncludingDeleted();
    apiRef.current.updateScene({ elements: scene.map((element) => element.id === frame.id ? {
      ...element,
      isDeleted: true,
      version: (element.version || 0) + 1,
      versionNonce: Math.floor(Math.random() * 2147483647),
      updated: Date.now()
    } : element) });
    flash("Frame removed from the canvas.");
  };

  const createFrame = (preset) => {
    if (!apiRef.current || readOnly) return;
    const sizes = {
      desktop: [1440, 900], tablet: [834, 1112], mobile: [390, 844], presentation: [1600, 900]
    };
    const [width, height] = sizes[preset] || sizes.desktop;
    const scene = apiRef.current.getSceneElementsIncludingDeleted();
    const visible = scene.filter((element) => !element.isDeleted);
    const centerX = visible.length ? Math.max(...visible.map((element) => element.x + element.width)) + 100 : -width / 2;
    const centerY = visible.length ? Math.min(...visible.map((element) => element.y)) : -height / 2;
    const frame = {
      id: globalThis.crypto?.randomUUID?.() || `frame-${Date.now()}`,
      type: "rectangle", x: centerX, y: centerY, width, height, angle: 0,
      strokeColor: theme === "dark" ? "#829b8d" : "#61766a", backgroundColor: "transparent",
      fillStyle: "solid", strokeWidth: 2, strokeStyle: "dashed", roughness: 0, opacity: 55,
      groupIds: [], frameId: null, roundness: null, seed: Math.floor(Math.random() * 2147483647),
      version: 1, versionNonce: Math.floor(Math.random() * 2147483647), isDeleted: false,
      boundElements: null, updated: Date.now(), link: null, locked: false,
      customData: { arcdrawFrame: true, framePreset: preset, frameName: `${preset[0].toUpperCase()}${preset.slice(1)} frame` }
    };
    // Keep frame boundaries behind existing artwork so they never cover it.
    apiRef.current.updateScene({ elements: [frame, ...scene], appState: { selectedElementIds: { [frame.id]: true } } });
    flash(`${preset[0].toUpperCase()}${preset.slice(1)} frame added.`);
  };

  const saveSelectedComponent = async (name) => {
    const scene = apiRef.current?.getSceneElementsIncludingDeleted?.() || [];
    const selected = scene.filter((element) => selectedElementIds.includes(element.id) && !element.isDeleted);
    if (!selected.length) throw new Error("Select one or more canvas elements first.");
    const componentId = globalThis.crypto?.randomUUID?.() || `component-${Date.now()}`;
    const masterElements = selected.map((element) => ({
      ...JSON.parse(JSON.stringify(element)),
      customData: { ...(element.customData || {}), arcdrawComponentMaster: componentId }
    }));
    const component = {
      id: componentId,
      name: String(name || "Untitled component").trim().slice(0, 80),
      elements: masterElements,
      variants: [{ id: "default", name: "Default", elements: masterElements }],
      properties: inferComponentProperties(masterElements),
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updatedScene = scene.map((element) => selectedElementIds.includes(element.id) ? masterElements.find((item) => item.id === element.id) || element : element);
    apiRef.current?.updateScene({ elements: updatedScene });
    await saveDesignStudio({ ...designStudio, components: [...designStudio.components, component] });
  };

  const saveSelectedVariant = async (componentId, variantName) => {
    const scene = apiRef.current?.getSceneElementsIncludingDeleted?.() || [];
    const selected = scene.filter((element) => selectedElementIds.includes(element.id) && !element.isDeleted);
    if (!selected.length) throw new Error("Select the variant elements on the canvas first.");
    const nextComponents = designStudio.components.map((component) => component.id === componentId ? {
      ...component,
      variants: [...(component.variants || []), {
        id: globalThis.crypto?.randomUUID?.() || `variant-${Date.now()}`,
        name: String(variantName || "New variant").trim().slice(0, 60),
        elements: selected.map((element) => JSON.parse(JSON.stringify(element))),
        properties: inferComponentProperties(selected)
      }],
      revision: (component.revision || 1) + 1,
      updatedAt: new Date().toISOString()
    } : component);
    await saveDesignStudio({ ...designStudio, components: nextComponents });
  };

  const updateStudioComponent = async (componentId) => {
    const scene = apiRef.current?.getSceneElementsIncludingDeleted?.() || [];
    const selected = scene.filter((element) => selectedElementIds.includes(element.id) && !element.isDeleted);
    if (!selected.length) { flash("Select the new master elements first."); return; }
    const current = designStudio.components.find((item) => item.id === componentId);
    if (!current) return;
    const masterElements = selected.map((element) => {
      const customData = { ...(element.customData || {}) };
      delete customData.arcdrawComponentInstance;
      delete customData.arcdrawSourceElementId;
      return { ...JSON.parse(JSON.stringify(element)), customData: { ...customData, arcdrawComponentMaster: componentId } };
    });
    const nextComponent = { ...current, elements: masterElements, properties: inferComponentProperties(masterElements), variants: (current.variants || []).map((variant, index) => index === 0 ? { ...variant, elements: masterElements, properties: inferComponentProperties(masterElements) } : variant), revision: (current.revision || 1) + 1, updatedAt: new Date().toISOString() };
    const source = nextComponent.variants?.[0]?.elements || masterElements;
    const sourceMinX = Math.min(...source.map((item) => item.x));
    const sourceMinY = Math.min(...source.map((item) => item.y));
    const byGroup = new Map();
    for (const element of scene) {
      const instance = element.customData?.arcdrawComponentInstance;
      if (!element.isDeleted && instance?.componentId === componentId && (instance.variantId || "default") === "default") {
        const key = instance.groupId || instance.instanceId || element.id;
        if (!byGroup.has(key)) byGroup.set(key, []);
        byGroup.get(key).push(element);
      }
    }
    const replacedIds = new Set();
    const replacements = [];
    for (const [instanceKey, members] of byGroup) {
      members.forEach((item) => replacedIds.add(item.id));
      const originX = Math.min(...members.map((item) => item.x));
      const originY = Math.min(...members.map((item) => item.y));
      const groupId = makeElementId();
      const previousInstance = members[0]?.customData?.arcdrawComponentInstance || {};
      source.forEach((element) => {
        const customData = { ...(element.customData || {}) };
        delete customData.arcdrawComponentMaster;
        let clone = JSON.parse(JSON.stringify(element));
        for (const property of nextComponent.properties || []) {
          if (!Object.prototype.hasOwnProperty.call(previousInstance.overrides || {}, property.id) || property.sourceElementId !== element.id) continue;
          const value = previousInstance.overrides[property.id];
          if (property.target === "text") clone = { ...clone, text: String(value ?? ""), originalText: String(value ?? "") };
          else if (property.target === "isDeleted") clone = { ...clone, isDeleted: !Boolean(value) };
          else clone = { ...clone, [property.target]: value };
        }
        replacements.push({
          ...clone, id: makeElementId(),
          x: originX + element.x - sourceMinX, y: originY + element.y - sourceMinY,
          groupIds: [groupId], version: 1, versionNonce: randomSeed(), isDeleted: Boolean(clone.isDeleted),
          customData: { ...customData, arcdrawSourceElementId: element.id, arcdrawComponentInstance: { componentId, variantId: "default", groupId, instanceId: instanceKey, revision: nextComponent.revision, overrides: { ...(previousInstance.overrides || {}) } } }
        });
      });
    }
    const retained = scene.filter((element) => !replacedIds.has(element.id));
    apiRef.current?.updateScene({ elements: [...retained, ...replacements] });
    await saveDesignStudio({ ...designStudio, components: designStudio.components.map((item) => item.id === componentId ? nextComponent : item) });
    flash(`Updated component and ${byGroup.size} linked instance${byGroup.size === 1 ? "" : "s"}.`);
  };

  const insertStudioComponent = (component, variantId = "default") => {
    if (!apiRef.current || readOnly) return;
    const variant = component.variants?.find((item) => item.id === variantId) || component.variants?.[0];
    const source = variant?.elements || component.elements || [];
    if (!source.length) return;
    const scene = apiRef.current.getSceneElementsIncludingDeleted();
    const visible = scene.filter((element) => !element.isDeleted);
    const maxX = visible.length ? Math.max(...visible.map((element) => element.x + element.width)) + 60 : 100;
    const minX = Math.min(...source.map((element) => element.x));
    const minY = Math.min(...source.map((element) => element.y));
    const groupId = makeElementId();
    const instanceId = makeElementId();
    const clones = source.map((element) => {
      const customData = { ...(element.customData || {}) };
      delete customData.arcdrawComponentMaster;
      return {
      ...JSON.parse(JSON.stringify(element)),
      id: makeElementId(),
      x: maxX + element.x - minX,
      y: 80 + element.y - minY,
      version: 1,
      versionNonce: randomSeed(),
      isDeleted: false,
      groupIds: [groupId],
      customData: { ...customData, arcdrawSourceElementId: element.id, arcdrawComponentInstance: { componentId: component.id, variantId, groupId, instanceId, revision: component.revision || 1, overrides: {} } }
    }; });
    apiRef.current.updateScene({ elements: [...scene, ...clones], appState: { selectedElementIds: Object.fromEntries(clones.map((element) => [element.id, true])) } });
  };

  const updateComponentInstanceProperty = (componentId, groupId, property, value) => {
    if (!apiRef.current || readOnly || !groupId || !property?.sourceElementId) return false;
    const scene = apiRef.current.getSceneElementsIncludingDeleted?.() || [];
    let changed = 0;
    const next = scene.map((element) => {
      const instance = element.customData?.arcdrawComponentInstance;
      if (!instance || instance.componentId !== componentId || instance.groupId !== groupId) return element;
      const isTarget = element.customData?.arcdrawSourceElementId === property.sourceElementId;
      const nextValue = property.type === "text" ? String(value ?? "")
        : property.type === "boolean" ? !Boolean(value)
          : value;
      const patch = !isTarget ? {} : property.target === "text"
        ? { text: nextValue, originalText: nextValue }
        : property.target === "isDeleted"
          ? { isDeleted: nextValue }
          : { [property.target]: nextValue };
      if (isTarget) changed += 1;
      return {
        ...element,
        ...patch,
        ...(isTarget ? { version: (element.version || 0) + 1, versionNonce: randomSeed(), updated: Date.now() } : {}),
        customData: { ...(element.customData || {}), arcdrawComponentInstance: { ...instance, overrides: { ...(instance.overrides || {}), [property.id]: value } } }
      };
    });
    if (!changed) return false;
    apiRef.current.updateScene({ elements: next });
    return true;
  };

  const groupSelectedElements = () => {
    if (!apiRef.current || readOnly || selectedElementIds.length < 2) return;
    const scene = apiRef.current.getSceneElementsIncludingDeleted();
    const selected = new Set(selectedElementIds);
    const groupId = makeElementId();
    const next = scene.map((element) => selected.has(element.id) && !element.isDeleted
      ? { ...element, groupIds: [...(element.groupIds || []), groupId], version: (element.version || 0) + 1, versionNonce: randomSeed(), updated: Date.now() }
      : element);
    apiRef.current.updateScene({ elements: next, appState: { selectedElementIds: Object.fromEntries(selectedElementIds.map((id) => [id, true])) } });
    flash("Grouped selected layers.");
  };

  const ungroupSelectedElements = () => {
    if (!apiRef.current || readOnly || !selectedElementIds.length) return;
    const scene = apiRef.current.getSceneElementsIncludingDeleted();
    const selected = new Set(selectedElementIds);
    let changed = 0;
    const next = scene.map((element) => {
      if (!selected.has(element.id) || element.isDeleted || !element.groupIds?.length) return element;
      changed += 1;
      return { ...element, groupIds: element.groupIds.slice(0, -1), version: (element.version || 0) + 1, versionNonce: randomSeed(), updated: Date.now() };
    });
    if (!changed) { flash("Selected layers are not grouped."); return; }
    apiRef.current.updateScene({ elements: next, appState: { selectedElementIds: Object.fromEntries(selectedElementIds.map((id) => [id, true])) } });
    flash("Ungrouped selected layers.");
  };

  const applyTokenToSelection = (token) => {
    if (!apiRef.current || readOnly) return;
    const scene = apiRef.current.getSceneElementsIncludingDeleted();
    const next = scene.map((element) => selectedElementIds.includes(element.id) && !element.isDeleted
      ? {
        ...element,
        strokeColor: token.value,
        ...(element.backgroundColor && element.backgroundColor !== "transparent" ? { backgroundColor: token.value } : {}),
        version: (element.version || 0) + 1,
        versionNonce: Math.floor(Math.random() * 2147483647),
        updated: Date.now()
      }
      : element);
    apiRef.current.updateScene({ elements: next });
  };

  const runAutoLayout = (direction, gap = 24) => {
    if (!apiRef.current || readOnly) return;
    const scene = apiRef.current.getSceneElementsIncludingDeleted();
    const selected = scene.filter((element) => selectedElementIds.includes(element.id) && !element.isDeleted).sort((a, b) => direction === "horizontal" ? a.x - b.x : a.y - b.y);
    if (selected.length < 2) { flash("Select at least two canvas elements to apply auto layout."); return; }
    let cursor = direction === "horizontal" ? Math.min(...selected.map((item) => item.x)) : Math.min(...selected.map((item) => item.y));
    const updates = new Map();
    selected.forEach((element) => {
      updates.set(element.id, direction === "horizontal" ? { x: cursor } : { y: cursor });
      cursor += (direction === "horizontal" ? element.width : element.height) + gap;
    });
    apiRef.current.updateScene({ elements: scene.map((element) => updates.has(element.id) ? { ...element, ...updates.get(element.id), version: (element.version || 0) + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() } : element) });
    flash(`Auto layout applied to ${selected.length} layers.`);
  };

  const cleanUpShapes = () => {
    if (!apiRef.current || readOnly) return;
    const scene = apiRef.current.getSceneElementsIncludingDeleted();
    let count = 0;
    const next = scene.map((element) => {
      if (element.isDeleted || ["text", "image", "frame", "magicframe", "embeddable", "iframe"].includes(element.type) || element.customData?.arcdrawFrame) return element;
      const needsRough = element.roughness !== 0;
      const needsRound = (element.type === "rectangle" || element.type === "diamond") && !element.roundness;
      if (!needsRough && !needsRound) return element;
      count += 1;
      return {
        ...element,
        roughness: 0,
        ...(needsRound ? { roundness: { type: 3 } } : {}),
        version: (element.version || 0) + 1,
        versionNonce: Math.floor(Math.random() * 2147483647),
        updated: Date.now()
      };
    });
    if (!count) { flash("Shapes are already clean."); return; }
    apiRef.current.updateScene({ elements: next });
    flash(`Cleaned up ${count} ${count === 1 ? "shape" : "shapes"}.`);
  };

  const toggleGrid = () => {
    const next = !gridOn;
    setGridOn(next);
    try { window.localStorage.setItem(GRID_KEY, next ? "1" : "0"); } catch { /* preference stays for this session */ }
    apiRef.current?.updateScene({ appState: { gridModeEnabled: next, gridSize: 20 } });
  };

  const confirmClearCanvas = () => {
    if (!apiRef.current || readOnly) return;
    apiRef.current.resetScene();
    setClearOpen(false);
    flash("Canvas cleared.");
  };

  // Every message goes through the shared toast system. The type is chosen from
  // the wording so older call sites keep working.
  const flash = (message) => {
    const text = String(message || "");
    if (/couldn't|could not|can't|failed|didn't/i.test(text)) toast.error(text);
    else if (/view only|select at least|no longer|live in their own|queued|already clean|reconnect/i.test(text)) toast.warning(text);
    else toast.success(text);
  };

  const flushRoomNotes = async () => {
    await notesPanelRef.current?.flush?.();
    const currentNotes = await listRoomNotes(guestId, localBoardId);
    if (cloudBoardId && collab.status === "connected" && collab.role !== "viewer") {
      collab.publishNotes(currentNotes);
      await collab.flushToServer();
    }
    return currentNotes;
  };

  const handleOpenProject = async () => {
    if (board?.kind === "notes" && rightPanel !== "project") {
      try { await flushRoomNotes(); } catch (error) { flash(friendlyError(error, "Note changes are queued for sync.")); }
    }
    setRightPanel((current) => current === "project" ? null : "project");
  };

  const handleOpenAgent = async () => {
    if (board?.kind === "notes") {
      try { await flushRoomNotes(); } catch (error) { flash(friendlyError(error, "Note changes are queued locally.")); }
    }
    setRightPanel((current) => current === "agent" ? null : "agent");
  };

  const projectItemPatch = (before, after) => {
    if (!before) return after;
    const fields = [
      "kind", "title", "description", "status", "priority", "assigneeId",
      "assigneeName", "dueDate", "milestoneId", "linkedElementId",
      "linkedNoteId", "parentTaskId", "dependsOnIds", "updatedAt", "deletedAt"
    ];
    const patch = { id: after.id };
    for (const field of fields) {
      if (before[field] !== after[field]) patch[field] = after[field] ?? null;
    }
    return patch;
  };

  const handleSaveProjectItem = async (values) => {
    const previousItems = projectItems;
    const updatedItems = await saveRoomProjectItem(guestId, localBoardId, values);
    setProjectItems(updatedItems);
    if (cloudBoardId && collab.role !== "viewer" && board?.permission !== "viewer") {
      const saved = updatedItems.find((item) => item.id === values.id) || updatedItems.find((item) => !previousItems.some((previous) => previous.id === item.id));
      if (saved) collab.publishProjectItems([projectItemPatch(previousItems.find((item) => item.id === saved.id), saved)]);
    }
    flash(values.id ? "Project item updated." : `${values.kind === "milestone" ? "Milestone" : "Task"} added to this room.`);
  };

  const handleDeleteProjectItem = async (itemId) => {
    const deletion = await deleteRoomProjectItem(guestId, localBoardId, itemId);
    setProjectItems(deletion.items);
    if (cloudBoardId && collab.role !== "viewer" && board?.permission !== "viewer") {
      const patches = [
        ...(deletion.tombstone ? [{ id: itemId, deletedAt: deletion.tombstone.deletedAt, updatedAt: deletion.tombstone.updatedAt }] : []),
        ...(deletion.changedItems || []).map((item) => projectItemPatch(projectItems.find((previous) => previous.id === item.id), item))
      ];
      if (patches.length) collab.publishProjectItems(patches);
    }
    flash("Project item deleted.");
  };

  const attachImageToNote = async (file) => {
    if (!file || readOnly || !isNotesRoom) return null;
    if (!file.type.startsWith("image/")) { flash("Choose an image file to attach."); return null; }
    if (file.size > 10 * 1024 * 1024) { flash("Choose an image smaller than 10 MB."); return null; }
    try {
      const sourceDataURL = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("This image could not be read."));
        reader.readAsDataURL(file);
      });
      const dimensions = await new Promise((resolve, reject) => {
        const image = new window.Image();
        image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
        image.onerror = () => reject(new Error("This image format could not be decoded."));
        image.src = sourceDataURL;
      });
      let storedDataURL = sourceDataURL;
      if (file.type !== "image/svg+xml" && file.type !== "image/gif") {
        const ratio = Math.min(1, 1280 / Math.max(dimensions.width, dimensions.height));
        const width = Math.max(1, Math.round(dimensions.width * ratio));
        const height = Math.max(1, Math.round(dimensions.height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Image optimization is unavailable in this browser.");
        const image = new window.Image(); image.src = sourceDataURL;
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
        context.drawImage(image, 0, 0, width, height);
        storedDataURL = canvas.toDataURL("image/webp", 0.82);
      }
      if (storedDataURL.length * 0.75 > 2.5 * 1024 * 1024) throw new Error("This image is too large to sync inside this room. Try a smaller image.");
      const currentFiles = board?.files || {};
      let totalBytes = Object.values(currentFiles).reduce((sum, value) => sum + String(value?.dataURL || "").length * 0.75, 0);
      totalBytes += storedDataURL.length * 0.75;
      if (totalBytes > 4.8 * 1024 * 1024) throw new Error("This room is near its sync limit. Remove unused images or add a smaller image.");
      const fileId = makeElementId();
      const now = Date.now();
      const record = { id: fileId, dataURL: storedDataURL, mimeType: storedDataURL.slice(5, storedDataURL.indexOf(";")) || file.type, created: now, lastRetrieved: now };
      const nextFiles = { ...currentFiles, [fileId]: record };
      const nextScene = { elements: board?.elements || [], appState: board?.appState || {}, files: nextFiles };
      await updateBoardScene(guestId, localBoardId, nextScene);
      setBoard((current) => current ? { ...current, files: nextFiles, updatedAt: new Date().toISOString() } : current);
      if (cloudBoardId && collab.role !== "viewer" && board?.permission !== "viewer") collab.publishScene(nextScene);
      flash("Image attached to note and synced with the room.");
      return fileId;
    } catch (error) {
      console.error("Note image attachment failed:", error);
      flash(error?.message || "Could not attach this image.");
      return null;
    }
  };

  const handleOpenProjectLink = (item) => {
    if (item.linkedNoteId) {
      if (!notes.some((note) => note.id === item.linkedNoteId)) {
        flash("That linked note is no longer in this room.");
        return;
      }
      if (board?.kind !== "notes") {
        flash("Notes live in their own Notes rooms. Open the linked Notes room to continue.");
        return;
      }
      setFocusNoteId(item.linkedNoteId);
      setRightPanel(null);
      return;
    }
    if (item.linkedElementId) {
      const element = (apiRef.current?.getSceneElementsIncludingDeleted?.() || board?.elements || []).find((entry) => entry.id === item.linkedElementId && !entry.isDeleted);
      if (!element || !apiRef.current) {
        flash("That canvas element is no longer in this room.");
        return;
      }
      setRightPanel(null);
      apiRef.current.updateScene({ appState: { selectedElementIds: { [element.id]: true } } });
      apiRef.current.scrollToContent?.([element], { fitToContent: true, animate: true });
    }
  };

  const handleBackToRooms = async () => {
    try {
      await flushSave();
      await flushRoomNotes();
      if (cloudBoardId && collab.status === "connected" && collab.role !== "viewer") await collab.flushToServer();
    } catch (error) {
      console.error("Room close flush failed:", error);
    }
    onBack?.();
  };

  const ensureCloudBoard = async () => {
    if (!isAuthenticated || !user?.id) throw new Error("Sign in to save this room to the cloud.");
    const currentNotes = await flushRoomNotes();
    if (board.cloudId) return board.cloudId;
    const result = await createCloudBoard({
      title: board.title,
      kind: board.kind || "board",
      sourceLocalId: board.id,
      scene: getLiveScene(),
      notes: currentNotes,
      projectItems
    });
    await setBoardCloudLink(guestId, board.id, result.board.id, effectiveShareToken);
    setBoard((current) => current ? { ...current, cloudId: result.board.id } : current);
    flash("Room saved to your cloud workspace.");
    return result.board.id;
  };

  const makeDiscussionItemId = () => globalThis.crypto?.randomUUID?.() || `discussion-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const publishRoomMessage = (body) => {
    if (readOnly || !user?.id) return false;
    const message = { id: makeDiscussionItemId(), body: String(body).slice(0, 2000), authorId: user.id, authorName: user.name || user.email || "Collaborator", authorAvatar: user.avatarUrl || null, createdAt: new Date().toISOString() };
    if (!collab.publishMessage(message)) { flash("Sign in and open a cloud room to use room discussion."); return false; }
    setDiscussion((current) => ({ ...current, messages: [...current.messages, message] }));
    return true;
  };
  const publishRoomComment = (body, elementId = null, parentId = null) => {
    if (readOnly || !user?.id) return false;
    const comment = { id: makeDiscussionItemId(), body: String(body).slice(0, 2000), authorId: user.id, authorName: user.name || user.email || "Collaborator", authorAvatar: user.avatarUrl || null, createdAt: new Date().toISOString(), elementId, resolved: false, parentId };
    if (!collab.publishComment(comment)) { flash("Sign in and open a cloud room to use comments."); return false; }
    setDiscussion((current) => ({ ...current, comments: [...current.comments, comment] }));
    return true;
  };
  const resolveRoomComment = (commentId, resolved) => {
    const comment = discussion.comments.find((item) => item.id === commentId);
    if (!comment || readOnly) return false;
    const next = { ...comment, resolved, editedAt: new Date().toISOString() };
    if (!collab.publishComment(next)) return false;
    setDiscussion((current) => ({ ...current, comments: current.comments.map((item) => item.id === commentId ? next : item) }));
    return true;
  };
  const focusCommentElement = (elementId) => {
    if (!elementId || !apiRef.current) return;
    const element = apiRef.current.getSceneElementsIncludingDeleted?.().find((item) => item.id === elementId && !item.isDeleted);
    if (!element) { flash("The linked canvas object is no longer available."); return; }
    apiRef.current.updateScene({ appState: { selectedElementIds: { [elementId]: true } } });
    apiRef.current.scrollToContent?.([element], { fitToContent: true, animate: true });
    setRightPanel(null);
  };

  const handleCreateNote = useCallback(async () => createRoomNote(guestId, localBoardId, {
    title: "Untitled note",
    content: "# A new thought\n\nCapture the context behind this room."
  }), [guestId, localBoardId]);

  const handleUpdateNote = useCallback(async (noteId, patch) => (
    updateRoomNote(guestId, localBoardId, noteId, patch)
  ), [guestId, localBoardId]);

  const handleNoteContentInput = useCallback((noteId, content) => {
    if (cloudBoardId && collab.role !== "viewer" && board?.permission !== "viewer") {
      collab.updateNoteContent(noteId, content);
    }
  }, [cloudBoardId, collab.role, collab.updateNoteContent, board?.permission]);

  const handleDeleteNote = useCallback(async (noteId) => (
    deleteRoomNote(guestId, localBoardId, noteId)
  ), [guestId, localBoardId]);

  const handleRename = async () => {
    const nextTitle = titleDraft.trim() || "Untitled room";
    try {
      await renameBoard(guestId, localBoardId, nextTitle);
      if (board.cloudId && collab.role !== "viewer") await renameCloudBoard(board.cloudId, nextTitle, effectiveShareToken);
      setBoard((current) => current ? { ...current, title: nextTitle } : current);
      setTitleDraft(nextTitle);
      setTitleEditing(false);
    } catch (error) {
      flash(friendlyError(error, "Couldn't rename this room."));
    }
  };

  const exportJson = async () => {
    await flushSave();
    const currentNotes = await flushRoomNotes();
    const payload = getExportPayload({ ...board, designStudio }, getLiveScene(), currentNotes, projectItems);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    downloadBlob(blob, `${safeFilename(board.title)}.excalidraw`);
    setExportMenuOpen(false);
  };

  const exportPng = async () => {
    if (!apiRef.current || board?.kind === "notes") return;
    try {
      setExportMenuOpen(false);
      const blob = await exportToBlob({
        elements: apiRef.current.getSceneElements(),
        appState: apiRef.current.getAppState(),
        files: apiRef.current.getFiles(),
        mimeType: "image/png",
        quality: 1,
        exportPadding: 24
      });
      downloadBlob(blob, `${safeFilename(board.title)}.png`);
    } catch (error) {
      console.error("PNG export failed:", error);
      flash("Couldn't export this room as PNG. Try the editable export instead.");
    }
  };

  const exportNotesMarkdown = async () => {
    if (board?.kind !== "notes") return;
    try {
      const currentNotes = await flushRoomNotes();
      const sections = currentNotes.map((note) => `## ${note.title || "Untitled note"}\n\n${note.content || ""}`);
      const markdown = `# ${board.title || "Notes"}\n\n${sections.length ? sections.join("\n\n---\n\n") : "No notes in this workspace yet."}\n`;
      downloadBlob(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), `${safeFilename(board.title)}.md`);
      setExportMenuOpen(false);
    } catch (error) {
      console.error("Notes export failed:", error);
      flash("Couldn't export these notes. Please try again.");
    }
  };

  const openShare = () => {
    if (!isAuthenticated) {
      onAccountRequired?.(ACCOUNT_REQUIRED_ACTIONS.SHARE);
      return;
    }
    if (readOnly) {
      flash("You have view-only access to this room.");
      return;
    }
    setShareLink("");
    setShareOpen(true);
  };

  const handleCloudSave = async () => {
    setCloudSaveBusy(true);
    try {
      await ensureCloudBoard();
    } catch (error) {
      flash(friendlyError(error, "Couldn't save this room to the cloud."));
    } finally {
      setCloudSaveBusy(false);
    }
  };

  const handleCreateShare = async (options) => {
    setShareBusy(true);
    try {
      const wasAlreadyCloud = Boolean(board.cloudId);
      await flushSave();
      await flushRoomNotes();
      const remoteId = await ensureCloudBoard();
      if (wasAlreadyCloud) {
        if (collab.status !== "connected") {
          throw new Error("Reconnect to the room before creating a share link so the latest edits are included.");
        }
        await collab.flushToServer();
      }
      const result = await createShareLink(remoteId, { ...options, shareToken: effectiveShareToken });
      setShareLink(result.url);
      flash("Room link created.");
    } catch (error) {
      flash(friendlyError(error, "Couldn't create a room link."));
    } finally {
      setShareBusy(false);
    }
  };

  const handleCommit = async (message) => {
    setCommitBusy(true);
    try {
      const remoteId = await ensureCloudBoard();
      await flushSave();
      await flushRoomNotes();
      await collab.flushToServer();
      await createBoardCommit(remoteId, message, effectiveShareToken);
      setCommitOpen(false);
      setHistoryRefreshKey((value) => value + 1);
      flash("Room checkpoint committed.");
    } catch (error) {
      flash(friendlyError(error, "Couldn't create a checkpoint."));
    } finally {
      setCommitBusy(false);
    }
  };

  const handleRestore = async (commit) => {
    await collab.flushToServer();
    await restoreBoardCommit(cloudBoardId, commit.id, effectiveShareToken);
    flash(`Restored checkpoint ${commit.shortHash}.`);
  };

  async function handleSaveMode(mode) {
    try {
      await updateBoardSettings(cloudBoardId, { workMode: mode });
      toast.success(mode === "commit" ? "Commit and review is on. Editors now submit changes to you." : "Live editing is on. Everyone edits together.");
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't change how this room works."));
      throw error;
    }
  }

  async function handleSubmitDraft(message) {
    setSubmitBusy(true);
    try {
      await collab.submitDraft(message);
      setSubmitOpen(false);
      setMyPending(true);
      setReviewRefresh(function (value) { return value + 1; });
      toast.success("Sent to the owner for review.");
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't submit your changes."));
    } finally {
      setSubmitBusy(false);
    }
  }

  async function handleDiscardDraft() {
    if (!confirmDiscard) { setConfirmDiscard(true); window.setTimeout(function () { setConfirmDiscard(false); }, 4000); return; }
    setConfirmDiscard(false);
    try {
      await collab.discardDraft();
      toast.success("Draft discarded. You are back in sync with the room.");
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't discard your draft."));
    }
  }

  function handleSendDraft() {
    collab.sendDraftToRoom();
    toast.success("Your changes were sent to the room.");
  }
  function openMode() { setModeOpen(true); }
  function closeMode() { setModeOpen(false); }
  function openReview() { setReviewOpen(true); }
  function closeReview() { setReviewOpen(false); }
  function openSubmit() { setSubmitOpen(true); }
  function closeSubmit() { setSubmitOpen(false); }
  function handleReviewChanged() { setReviewRefresh(function (value) { return value + 1; }); }

  // Use cached permission while connecting to avoid briefly exposing an
  // editor to a previously known viewer; the server's live role wins once joined.
  const readOnly = collab.role === "revoked"
    || (collab.status === "connected" ? collab.role === "viewer" : board?.permission === "viewer");
  const collabLabel = collab.status === "connected"
    ? (collab.pendingUpdates > 0 ? "Syncing" : "Synced")
    : collab.status === "connecting" ? "Connecting"
      : collab.status === "offline" ? "Offline · queued"
        : collab.status === "error" ? "Sync issue" : "Local";
  const notesSyncLabel = !cloudBoardId ? "Saved locally" : collab.status === "connected" ? (collab.pendingUpdates > 0 ? "Syncing changes" : "Synced") : collab.status === "offline" ? "Offline · changes queued" : collab.status === "error" ? "Sync needs attention" : "Connecting to room";

  const remoteCursors = useMemo(() => {
    const api = apiRef.current;
    const area = pointerAreaRef.current;
    if (!api || !area) return [];
    const bounds = area.getBoundingClientRect();
    return collab.participants.filter((person) => Number.isFinite(person.x) && Number.isFinite(person.y) && person.userId !== user?.id).map((person) => {
      try {
        const point = sceneCoordsToViewportCoords({ sceneX: person.x, sceneY: person.y }, api.getAppState());
        return { ...person, left: point.x - bounds.left, top: point.y - bounds.top, color: cursorColor(person.userId) };
      } catch { return null; }
    }).filter(Boolean);
  }, [collab.participants, user?.id, editorReady]);

  if (loading) {
    return <div className="editor-loading"><LoaderCircle size={22} className="spin" /><span>Opening your room…</span></div>;
  }

  if (!board || loadError) {
    return (
      <main className="editor-error-screen">
        <p className="section-kicker">Room unavailable</p>
        <h1>We couldn't open this room.</h1>
        <p>{loadError}</p>
        <button className="primary-button" type="button" onClick={handleBackToRooms}><ArrowLeft size={15} /> Back to rooms</button>
      </main>
    );
  }

  const isNotesRoom = board.kind === "notes";
  const taskCount = projectItems.filter(function (item) { return item.kind !== "milestone" && !item.deletedAt; }).length;
  const objectCount = (board.elements || []).filter(function (item) { return !item.isDeleted; }).length;
  const saveText = saveStatus === "saving" ? "Saving" : saveStatus === "error" ? "Save issue" : "Saved on device";
  const roomLabel = board.cloudId ? (readOnly ? "View only" : collab.status === "connected" ? "Live" : "Cloud") : "Local";

  function togglePanel(name) {
    return function () { setRightPanel(function (current) { return current === name ? null : name; }); };
  }
  function closePanel() { setRightPanel(null); }
  function startTitleEdit() { if (!readOnly) { setTitleDraft(board.title); setTitleEditing(true); } }
  function handleTitleDraft(event) { setTitleDraft(event.target.value); }
  function handleTitleKey(event) {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") { setTitleDraft(board.title); setTitleEditing(false); }
  }
  function openCommit() { setCommitOpen(true); }
  function openHistory() { setHistoryOpen(true); }
  function closeShare() { setShareOpen(false); }
  function closeCommit() { setCommitOpen(false); }
  function closeHistory() { setHistoryOpen(false); }
  function startPresentation() {
    setPresentationMode(true);
    setRightPanel(null);
    apiRef.current?.scrollToContent?.(apiRef.current.getSceneElements(), { fitToContent: true, animate: true });
  }
  function stopPresentation() { setPresentationMode(false); }
  function requireAgentAccount() { onAccountRequired?.(ACCOUNT_REQUIRED_ACTIONS.AGENT); }
  function selectStudioElement(element) {
    if (!apiRef.current) return;
    apiRef.current.updateScene({ appState: { selectedElementIds: { [element.id]: true } } });
    apiRef.current.scrollToContent?.([element], { fitToContent: true, animate: true });
  }

  const sceneElements = isNotesRoom ? [] : (apiRef.current?.getSceneElementsIncludingDeleted?.() || board.elements || []);
  const assignees = [{ id: user?.id || guestId, name: user?.name || user?.email || "You" }].concat(
    collab.participants.filter(function (person) { return person.userId && person.userId !== user?.id; }).map(function (person) { return { id: person.userId, name: person.name || "Collaborator" }; })
  );

  const menuItems = [
    { label: "Back to rooms", icon: <ArrowLeft size={15} />, onSelect: handleBackToRooms },
    { label: "Rename room", icon: <Pencil size={15} />, onSelect: startTitleEdit, disabled: readOnly },
    ...(board.cloudId && isOwner ? [{ label: "How this room works", icon: <SlidersHorizontal size={15} />, onSelect: openMode }] : []),
    { type: "separator" },
    isNotesRoom
      ? { label: "Export as Markdown", icon: <FileText size={15} />, onSelect: exportNotesMarkdown }
      : { label: "Export as PNG", icon: <Image size={15} />, onSelect: exportPng },
    { label: "Export editable room", icon: <FileJson size={15} />, onSelect: exportJson },
    ...(isNotesRoom ? [] : [
      { type: "separator" },
      { label: "Clean up shapes", icon: <Brush size={15} />, onSelect: cleanUpShapes, disabled: readOnly },
      { label: gridOn ? "Hide grid" : "Show grid", icon: <Grid3x3 size={15} />, onSelect: toggleGrid },
      { label: "Clear canvas", icon: <Eraser size={15} />, onSelect: () => setClearOpen(true), disabled: readOnly, danger: true }
    ]),
    { type: "separator" },
    { label: theme === "dark" ? "Light mode" : "Dark mode", icon: theme === "dark" ? <Sun size={15} /> : <Moon size={15} />, onSelect: toggleTheme }
  ];

  function renderMoreTrigger({ toggle, open }) {
    return <button className={`room-btn ${open ? "is-active" : ""}`} type="button" data-menu-trigger onClick={toggle} aria-label="Room menu" aria-haspopup="menu" aria-expanded={open}><MoreHorizontal size={18} /></button>;
  }

  const titleNode = (
    <div className={`room-title ${isNotesRoom ? "is-notes" : ""}`}>
      <button className="room-btn" type="button" onClick={handleBackToRooms} aria-label="Back to rooms"><ArrowLeft size={18} /></button>
      {titleEditing && !readOnly ? (
        <input className="room-title-input" autoFocus value={titleDraft} onChange={handleTitleDraft} onBlur={handleRename} onKeyDown={handleTitleKey} aria-label="Room title" />
      ) : (
        <button className="room-title-button" type="button" onClick={startTitleEdit} title={readOnly ? board.title : "Rename room"}>
          <strong>{board.title}</strong><span>{isNotesRoom ? "Notes" : "Board"}, {roomLabel.toLowerCase()}</span>
        </button>
      )}
    </div>
  );

  const avatarsNode = board.cloudId ? (
    <div className="room-avatars" aria-label="Room participants">
      {collab.participants.slice(0, 4).map(function (person) {
        return <span key={person.userId} title={person.name} style={{ "--avatar-color": cursorColor(person.userId) }}>{(person.name || "A").slice(0, 1).toUpperCase()}</span>;
      })}
      {collab.participants.length > 4 && <span className="room-avatar-more">+{collab.participants.length - 4}</span>}
    </div>
  ) : null;

  const topRightNode = (
    <div className="room-topright">
      {board.cloudId && <span className={`room-sync ${collab.status}`} title={collab.error || "Cloud sync status"}><i />{collabLabel}{collab.status === "connected" ? ` · ${collab.participants.length}` : ""}</span>}
      {board.cloudId && !readOnly && (isOwner
        ? <button className="room-mode-chip" type="button" onClick={openMode} title="Change how this room works">{collab.workMode === "commit" ? <GitPullRequest size={13} /> : <Zap size={13} />}{collab.workMode === "commit" ? "Commit mode" : "Live mode"}</button>
        : <span className="room-mode-chip" title="Set by the room owner">{collab.workMode === "commit" ? <GitPullRequest size={13} /> : <Zap size={13} />}{collab.workMode === "commit" ? "Commit mode" : "Live mode"}</span>)}
      {avatarsNode}
      {readOnly && <span className="room-viewonly">View only</span>}
      {!readOnly && <button className="room-share" type="button" onClick={openShare}><Share2 size={15} /> Share</button>}
      <Menu renderTrigger={renderMoreTrigger} items={menuItems} width={244} label="Room menu" />
    </div>
  );

  const dockNode = (
    <nav className="room-dock" aria-label="Room tools">
      <button className={`room-dock-btn ${rightPanel === "discussion" ? "is-active" : ""}`} type="button" data-tip="Discussion" aria-label="Discussion" onClick={togglePanel("discussion")}><MessageCircle size={20} strokeWidth={1.7} />{discussion.messages.length + discussion.comments.filter((item) => !item.resolved).length > 0 && <b>{discussion.messages.length + discussion.comments.filter((item) => !item.resolved).length}</b>}</button>
      <button className={`room-dock-btn ${rightPanel === "project" ? "is-active" : ""}`} type="button" data-tip="Project" aria-label="Project" onClick={handleOpenProject}><SquareKanban size={20} strokeWidth={1.7} />{taskCount > 0 && <b>{taskCount}</b>}</button>
      <button className={`room-dock-btn ${rightPanel === "agent" ? "is-active" : ""}`} type="button" data-tip="Agent" aria-label="Agent" onClick={handleOpenAgent}><WandSparkles size={20} strokeWidth={1.7} /></button>
      {!isNotesRoom && <button className={`room-dock-btn ${rightPanel === "studio" ? "is-active" : ""}`} type="button" data-tip="Studio" aria-label="Studio" onClick={togglePanel("studio")}><Palette size={20} strokeWidth={1.7} /></button>}
      {!isNotesRoom && <button className="room-dock-btn" type="button" data-tip="Present" aria-label="Present" onClick={startPresentation}><Presentation size={20} strokeWidth={1.7} /></button>}
      {(board.cloudId || (isAuthenticated && !board.cloudId)) && <span className="room-dock-sep" />}
      {isAuthenticated && !board.cloudId && <button className="room-dock-btn" type="button" data-tip="Save to cloud" aria-label="Save to cloud" disabled={cloudSaveBusy} onClick={handleCloudSave}>{cloudSaveBusy ? <LoaderCircle size={18} className="spin" /> : <CloudUpload size={18} />}</button>}
      {board.cloudId && !inDraft && collab.draftState !== "choose" && <button className="room-dock-btn" type="button" data-tip="Commit" aria-label="Commit" disabled={collab.status !== "connected" || readOnly} onClick={openCommit}><GitCommit size={18} /></button>}
      {board.cloudId && inDraft && <button className="room-dock-btn" type="button" data-tip="Submit for review" aria-label="Submit for review" disabled={collab.status !== "connected" || draftTotal === 0 || myPending} onClick={openSubmit}><GitPullRequest size={18} />{draftTotal > 0 && <b>{draftTotal}</b>}</button>}
      {board.cloudId && isOwner && (collab.workMode === "commit" || reviewCount > 0) && <button className="room-dock-btn" type="button" data-tip="Review requests" aria-label="Review requests" onClick={openReview}><GitMerge size={18} />{reviewCount > 0 && <b>{reviewCount}</b>}</button>}
      {board.cloudId && inDraft && <button className="room-dock-btn" type="button" data-tip="My requests" aria-label="My requests" onClick={openReview}><GitMerge size={18} /></button>}
      {board.cloudId && <button className="room-dock-btn" type="button" data-tip="History" aria-label="History" disabled={!isOnline} onClick={openHistory}><History size={18} /></button>}
    </nav>
  );

  const statusNode = (
    <div className="room-status">
      <span className="room-status-item">{saveStatus === "saving" ? <LoaderCircle size={12} className="spin" /> : saveStatus === "error" ? <i className="is-error" /> : <Check size={12} />}{saveText}</span>
      <span className="room-status-item">{isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}{isOnline ? "Online" : "Offline"}</span>
      <span className="room-status-item room-status-dim">{isNotesRoom ? `${notes.length} notes` : `${objectCount} objects`}, {taskCount} tasks</span>
    </div>
  );

  const TOOL_LIST = [
    { type: "selection", label: "Select", key: "1", icon: MousePointer2 },
    { type: "hand", label: "Pan", key: "H", icon: Hand },
    { type: "sep" },
    { type: "rectangle", label: "Rectangle", key: "2", icon: Square },
    { type: "diamond", label: "Diamond", key: "3", icon: Diamond },
    { type: "ellipse", label: "Ellipse", key: "4", icon: Circle },
    { type: "arrow", label: "Arrow", key: "5", icon: MoveUpRight },
    { type: "line", label: "Line", key: "6", icon: Minus },
    { type: "freedraw", label: "Draw", key: "7", icon: PenLine },
    { type: "sep" },
    { type: "text", label: "Text", key: "8", icon: Type },
    { type: "image", label: "Image", key: "9", icon: ImagePlus },
    { type: "sticky", label: "Sticky note", key: "N", icon: StickyNote },
    { type: "frame", label: "Frame", key: "F", icon: Frame },
    { type: "eraser", label: "Eraser", key: "0", icon: Eraser }
  ];
  const makeElementId = () => globalThis.crypto?.randomUUID?.().replace(/-/g, "") || `arcdraw-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const randomSeed = () => Math.floor(Math.random() * 2147483646) + 1;

  const insertImageFile = async (file) => {
    if (!file || !apiRef.current || readOnly) return;
    if (!file.type.startsWith("image/")) { flash("Choose an image file to add to the canvas."); return; }
    if (file.size > 12 * 1024 * 1024) { flash("Images must be smaller than 12 MB. Use a smaller image for reliable sync."); return; }
    try {
      const dataURL = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("This image could not be read."));
        reader.readAsDataURL(file);
      });
      const dimensions = await new Promise((resolve, reject) => {
        const image = new window.Image();
        image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
        image.onerror = () => reject(new Error("This image format could not be decoded by the browser."));
        image.src = dataURL;
      });
      const maxDimension = 1200;
      const ratio = Math.min(1, maxDimension / Math.max(dimensions.width, dimensions.height));
      const width = Math.max(1, Math.round(dimensions.width * ratio));
      const height = Math.max(1, Math.round(dimensions.height * ratio));
      let storedDataURL = dataURL;
      // Downsample oversized images before they enter the shared Yjs payload.
      if ((ratio < 1 || file.size > 3 * 1024 * 1024) && file.type !== "image/svg+xml" && file.type !== "image/gif") {
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext("2d");
        const image = new window.Image(); image.src = dataURL;
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
        context.drawImage(image, 0, 0, width, height);
        storedDataURL = canvas.toDataURL("image/webp", 0.84);
      }
      if (storedDataURL.length * 0.75 > 4.5 * 1024 * 1024) {
        throw new Error("This image is still too large to sync reliably. Try a smaller image.");
      }
      const api = apiRef.current;
      const existingFiles = api.getFiles?.() || {};
      const currentImageBytes = Object.values(existingFiles).reduce((sum, value) => sum + String(value?.dataURL || "").length * 0.75, 0);
      if (currentImageBytes + storedDataURL.length * 0.75 > 4.8 * 1024 * 1024) {
        throw new Error("This room is near its sync limit. Remove unused images or add a smaller image.");
      }
      const fileId = makeElementId();
      const record = { id: fileId, dataURL: storedDataURL, mimeType: storedDataURL.slice(5, storedDataURL.indexOf(";")) || file.type, created: Date.now(), lastRetrieved: Date.now() };
      api.addFiles?.([record]);
      const appState = api.getAppState?.() || {};
      const zoom = appState.zoom?.value || 1;
      const host = pointerAreaRef.current?.getBoundingClientRect();
      const sceneWidth = (host?.width || window.innerWidth) / zoom;
      const sceneHeight = (host?.height || window.innerHeight) / zoom;
      const x = -(appState.scrollX || 0) + sceneWidth / 2 - width / 2;
      const y = -(appState.scrollY || 0) + sceneHeight / 2 - height / 2;
      const element = {
        id: makeElementId(), type: "image", x, y, width, height, angle: 0,
        strokeColor: "transparent", backgroundColor: "transparent", fillStyle: "solid",
        strokeWidth: 1, strokeStyle: "solid", roughness: 0, opacity: 100,
        groupIds: [], frameId: null, roundness: null, seed: randomSeed(), version: 1,
        versionNonce: randomSeed(), isDeleted: false, boundElements: null, updated: Date.now(),
        link: null, locked: false, status: "saved", fileId, scale: [1, 1], crop: null
      };
      const existing = api.getSceneElementsIncludingDeleted?.() || [];
      api.updateScene({ elements: [...existing, element], appState: { selectedElementIds: { [element.id]: true } } });
      // Persist the new BinaryFileData immediately as well as through Excalidraw's
      // onChange callback. This avoids depending on timing differences between
      // addFiles() and the next scene callback for image-heavy rooms.
      const scene = {
        elements: [...existing, element],
        appState: { ...appState, selectedElementIds: { [element.id]: true } },
        files: { ...existingFiles, [fileId]: record }
      };
      pendingScene.current = scene;
      if (cloudBoardId && collab.role !== "viewer") collab.publishScene(scene);
      setSaveStatus("saving");
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => { void flushSave(); }, 0);
      flash("Image added to canvas.");
    } catch (error) {
      console.error("Image insertion failed:", error);
      flash(error?.message || "Could not add this image.");
    }
  };

  function pickTool(type) {
    return function () {
      if (type === "image") { imageInputRef.current?.click(); return; }
      if (type === "sticky") { createStickyNote(); return; }
      apiRef.current?.setActiveTool({ type });
    };
  }

  const createStickyNote = () => {
    if (!apiRef.current || readOnly) return;
    const api = apiRef.current;
    const appState = api.getAppState?.() || {};
    const zoom = appState.zoom?.value || 1;
    const host = pointerAreaRef.current?.getBoundingClientRect();
    const width = 240, height = 190;
    const x = -(appState.scrollX || 0) + (host?.width || window.innerWidth) / zoom / 2 - width / 2;
    const y = -(appState.scrollY || 0) + (host?.height || window.innerHeight) / zoom / 2 - height / 2;
    const stickyId = makeElementId();
    const groupId = makeElementId();
    const base = { angle: 0, strokeWidth: 1, strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [groupId], frameId: null, roundness: { type: 3 }, seed: randomSeed(), version: 1, versionNonce: randomSeed(), isDeleted: false, boundElements: null, updated: Date.now(), link: null, locked: false };
    const paper = { ...base, id: stickyId, type: "rectangle", x, y, width, height, strokeColor: "#d7c778", backgroundColor: "#fff0a8", fillStyle: "solid", customData: { arcdrawSticky: true, stickyId } };
    const text = { ...base, id: makeElementId(), type: "text", x: x + 18, y: y + 17, width: width - 36, height: height - 34, strokeColor: "#363326", backgroundColor: "transparent", fillStyle: "solid", fontSize: 20, fontFamily: 6, text: "Write something…", originalText: "Write something…", textAlign: "left", verticalAlign: "top", baseline: 19, containerId: null, lineHeight: 1.25, customData: { arcdrawStickyText: true, stickyId } };
    const existing = api.getSceneElementsIncludingDeleted?.() || [];
    api.updateScene({ elements: [...existing, paper, text], appState: { selectedElementIds: { [text.id]: true } } });
    flash("Sticky note added.");
  };
  const handleStageDrop = (event) => {
    const imageFile = Array.from(event.dataTransfer?.files || []).find((file) => file.type.startsWith("image/"));
    if (!imageFile) return;
    event.preventDefault();
    event.stopPropagation();
    void insertImageFile(imageFile);
  };
  const handleStagePaste = (event) => {
    const item = Array.from(event.clipboardData?.items || []).find((entry) => entry.type.startsWith("image/"));
    const file = item?.getAsFile?.();
    if (!file) return;
    event.preventDefault();
    event.stopPropagation();
    void insertImageFile(file);
  };

  const toolsNode = readOnly ? null : (
    <div className="room-tools" role="toolbar" aria-label="Drawing tools">
      {TOOL_LIST.map(function (tool, index) {
        if (tool.type === "sep") return <span className="room-tools-sep" key={`sep-${index}`} />;
        const Icon = tool.icon;
        return (
          <button key={tool.type} className={`room-tool ${activeToolType === tool.type ? "is-active" : ""}`} type="button" onClick={pickTool(tool.type)} aria-label={tool.label} aria-pressed={activeToolType === tool.type} data-tip={`${tool.label}  ${tool.key}`}>
            <Icon size={20} strokeWidth={1.7} />
          </button>
        );
      })}
    </div>
  );

  function renderExcalidrawTopRight() { return topRightNode; }

  const panelNode = rightPanel ? (
    <>
    <button className="sheet-scrim" type="button" aria-label="Close panel" onClick={closePanel} />
    <div className="room-panel">
      {rightPanel === "discussion" && (
        <DiscussionPanel
          messages={discussion.messages}
          comments={discussion.comments}
          participants={collab.participants}
          selectedElementId={selectedElementId}
          readOnly={readOnly}
          currentUser={user}
          onSendMessage={publishRoomMessage}
          onAddComment={publishRoomComment}
          onResolveComment={resolveRoomComment}
          onFocusElement={focusCommentElement}
          onClose={closePanel}
        />
      )}
      {rightPanel === "project" && (
        <RoomProjectPanel
          items={projectItems}
          notes={isNotesRoom ? notes : []}
          elements={sceneElements}
          selectedElementId={isNotesRoom ? null : selectedElementId}
          assignees={assignees}
          readOnly={readOnly}
          roomKind={board.kind || "board"}
          onClose={closePanel}
          onSave={handleSaveProjectItem}
          onDelete={handleDeleteProjectItem}
          onOpenLink={handleOpenProjectLink}
        />
      )}
      {rightPanel === "agent" && (
        <RoomAgentPanel
          room={board}
          notes={notes}
          elements={sceneElements}
          projectItems={projectItems}
          readOnly={readOnly}
          isAuthenticated={isAuthenticated}
          onRequireAccount={requireAgentAccount}
          onSaveTasks={handleSaveProjectItem}
          onClose={closePanel}
        />
      )}
      {rightPanel === "studio" && !isNotesRoom && (
        <RoomDesignPanel
          elements={sceneElements}
          selectedElementIds={selectedElementIds}
          designStudio={designStudio}
          readOnly={readOnly}
          onClose={closePanel}
          onCreateFrame={createFrame}
          onSaveComponent={saveSelectedComponent}
          onUpdateComponent={updateStudioComponent}
          onSaveVariant={saveSelectedVariant}
          onInsertComponent={insertStudioComponent}
          onUpdateInstanceProperty={updateComponentInstanceProperty}
          onSaveStudio={saveDesignStudio}
          onApplyToken={applyTokenToSelection}
          onAutoLayout={runAutoLayout}
          onSelectElement={selectStudioElement}
          onUpdateElements={updateCanvasElements}
          onGroupSelected={groupSelectedElements}
          onUngroupSelected={ungroupSelectedElements}
          onMoveLayer={moveCanvasLayer}
          onRenameFrame={renameFrame}
          onDeleteFrame={deleteFrame}
          onPresent={startPresentation}
        />
      )}
    </div>
    </>
  ) : null;

  return (
    <main className={`room ${isNotesRoom ? "room-notes" : "room-board"} ${presentationMode ? "is-presenting" : ""}`}>
      {isNotesRoom ? (
        <div className="room-stage">
          <RoomNotesPanel
            ref={notesPanelRef}
            standalone
            notes={notes}
            files={board?.files || {}}
            loading={notesLoading}
            readOnly={readOnly}
            syncLabel={notesSyncLabel}
            focusNoteId={focusNoteId}
            onCreate={handleCreateNote}
            onUpdate={handleUpdateNote}
            onContentInput={handleNoteContentInput}
            onDelete={handleDeleteNote}
            onAttachImage={attachImageToNote}
          />
          {titleNode}
          {topRightNode}
          {dockNode}
          {panelNode}
          {statusNode}
        </div>
      ) : (
        <div className="room-stage" ref={pointerAreaRef} onDrop={handleStageDrop} onDragOver={(event) => { if (Array.from(event.dataTransfer?.types || []).includes("Files")) event.preventDefault(); }} onPaste={handleStagePaste}>
          <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void insertImageFile(file); event.target.value = ""; }} />
          <div className="excalidraw-host">
            <Excalidraw
              key={board.id}
              excalidrawAPI={handleExcalidrawAPI}
              initialData={excalidrawInitialData}
              onChange={handleChange}
              onPointerUpdate={handlePointerUpdate}
              theme={theme}
              langCode="en"
              viewModeEnabled={readOnly || presentationMode}
              isCollaborating={collab.status === "connected"}
              UIOptions={EXCALIDRAW_UI_OPTIONS}
              renderTopRightUI={renderExcalidrawTopRight}
            >
              <MainMenu>
                <MainMenu.Item onSelect={handleBackToRooms} icon={<ArrowLeft size={15} />}>Back to rooms</MainMenu.Item>
                <MainMenu.Item onSelect={startTitleEdit} icon={<Pencil size={15} />}>Rename room</MainMenu.Item>
                <MainMenu.Separator />
                <MainMenu.Item onSelect={exportPng} icon={<Image size={15} />}>Export as PNG</MainMenu.Item>
                <MainMenu.Item onSelect={exportJson} icon={<FileJson size={15} />}>Export editable room</MainMenu.Item>
                <MainMenu.Separator />
                <MainMenu.DefaultItems.ClearCanvas />
                <MainMenu.DefaultItems.ChangeCanvasBackground />
                <MainMenu.DefaultItems.Help />
                <MainMenu.Separator />
                <MainMenu.Item onSelect={toggleTheme} icon={theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}>{theme === "dark" ? "Light mode" : "Dark mode"}</MainMenu.Item>
              </MainMenu>
              <Footer>{statusNode}</Footer>
            </Excalidraw>
          </div>
          {titleNode}
          {toolsNode}
          {dockNode}
          {panelNode}
          {remoteCursors.map(function (person) {
            return <div className="remote-cursor" key={person.userId} style={{ left: person.left, top: person.top, "--cursor-color": person.color }}><svg viewBox="0 0 18 22" aria-hidden="true"><path d="M2 1 16 13 9.4 14.2 6 20Z" fill="var(--cursor-color)" stroke="var(--bg)" strokeWidth="1.4" /></svg><span>{person.name}</span></div>;
          })}
        </div>
      )}

      {collab.error && board.cloudId && <div className="room-banner"><WifiOff size={13} /> {collab.error}</div>}
      {presentationMode && <div className="presentation-exit-bar"><span>Presentation view · {board.title}</span><button type="button" onClick={stopPresentation}>Exit presentation</button></div>}

      {shareOpen && <ShareDialog board={board} link={shareLink} shareToken={effectiveShareToken} onCreate={handleCreateShare} onClose={closeShare} busy={shareBusy} />}
      {clearOpen && (
        <Drawer
          size="sm" title="Clear canvas" subtitle={board.title} icon={<Trash2 size={20} strokeWidth={1.8} />} onClose={() => setClearOpen(false)}
          footer={({ close }) => (
            <>
              <button className="secondary-button" type="button" onClick={close}>Keep it</button>
              <button className="primary-button danger-button" type="button" onClick={confirmClearCanvas}>Clear canvas</button>
            </>
          )}
        >
          <div className="drawer-note">Removes every shape from this board. You can undo right after.</div>
        </Drawer>
      )}
      {commitOpen && <CommitDialog onClose={closeCommit} onCommit={handleCommit} busy={commitBusy} />}
      {submitOpen && <CommitDialog mode="submit" summary={collab.draftSummary} onClose={closeSubmit} onCommit={handleSubmitDraft} busy={submitBusy} />}
      {modeOpen && <ModeDrawer current={collab.workMode} onSave={handleSaveMode} onClose={closeMode} />}
      {reviewOpen && board.cloudId && <ReviewDrawer boardId={board.cloudId} shareToken={effectiveShareToken} isOwner={isOwner} refreshKey={reviewRefresh} onClose={closeReview} onChanged={handleReviewChanged} />}
      {inDraft && !presentationMode && (
        <div className="room-draftbar" role="status">
          <span>{myPending ? "Waiting for the owner to review your request." : draftTotal > 0 ? "Draft mode. " + draftTotal + (draftTotal === 1 ? " change is" : " changes are") + " private until the owner merges them." : "Draft mode. Your edits stay private until you submit them."}</span>
          {!myPending && draftTotal > 0 && <button type="button" onClick={openSubmit} disabled={collab.status !== "connected"}>Submit</button>}
          {draftTotal > 0 && <button className="is-ghost" type="button" onClick={handleDiscardDraft}>{confirmDiscard ? "Tap again to discard" : "Discard"}</button>}
        </div>
      )}
      {collab.draftState === "choose" && (
        <div className="room-draftbar" role="status">
          <span>The owner turned on live editing. You have {collab.draftSummary?.total || 0} unsent changes.</span>
          <button type="button" onClick={handleSendDraft}>Send to room</button>
          <button className="is-ghost" type="button" onClick={handleDiscardDraft}>{confirmDiscard ? "Tap again to discard" : "Discard"}</button>
        </div>
      )}
      {historyOpen && board.cloudId && <HistoryDrawer boardId={board.cloudId} shareToken={effectiveShareToken} canRestore={!readOnly && collab.status === "connected"} refreshKey={historyRefreshKey} onClose={closeHistory} onRestore={handleRestore} />}
    </main>
  );
}
