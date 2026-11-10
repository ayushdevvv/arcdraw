import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { IndexeddbPersistence } from "y-indexeddb";
import { API_BASE_URL } from "../services/apiClient.js";
import {
  Y, hasYjsScene, writeSceneToYjs, readSceneFromYjs,
  readNotesFromYjs, writeNotesToYjs, updateNoteContentInYjs,
  readProjectItemsFromYjs, writeProjectItemsToYjs,
  readDesignStudioFromYjs, writeDesignStudioToYjs,
  readRoomDiscussion, writeRoomMessage, writeRoomComment,
  summarizeDocDifference, canonicalJson,
  encodeUpdateBase64, decodeUpdateBase64, LOCAL_SCENE_ORIGIN, REMOTE_SCENE_ORIGIN
} from "./yjsScene.js";

const API_ORIGIN = new URL(API_BASE_URL).origin;

function draftFlagKey(userId, roomId) {
  return `arcdraw:draft:${userId}:${roomId}`;
}
function readDraftFlag(userId, roomId) {
  try { return window.localStorage.getItem(draftFlagKey(userId, roomId)) === "1"; } catch { return false; }
}
function writeDraftFlag(userId, roomId, on) {
  try {
    if (on) window.localStorage.setItem(draftFlagKey(userId, roomId), "1");
    else window.localStorage.removeItem(draftFlagKey(userId, roomId));
  } catch {
    // The flag only improves a prompt. Losing it is harmless.
  }
}

/**
 * Live room sync.
 *
 * Two ways of working, chosen by the room owner:
 *  - "live":   every editor's change is sent to the room as it happens.
 *  - "commit": only the owner changes the room directly. An editor works on a
 *              private draft (kept on their device) and submits it for the owner
 *              to review. While drafting they still receive the owner's changes.
 */
export function useBoardCollaboration({
  boardId, localUserId, shareToken = null, roleHint = null, initialWorkMode = "live",
  initialScene, initialNotes = [], initialProjectItems = [], initialDesignStudio = {}, enabled = true,
  onRemoteScene, onRemoteNotes, onRemoteProjectItems, onRemoteDesignStudio, onRemoteDiscussion, onModeChange, onProposalEvent
}) {
  const docRef = useRef(null);
  const socketRef = useRef(null);
  const joinedRef = useRef(false);
  const lastPointerAt = useRef(0);
  const knownElementValuesRef = useRef(new Map());
  const knownElementVersionsRef = useRef(new Map());
  const knownFileValuesRef = useRef(new Map());
  const knownFileRefsRef = useRef(new Map());
  const knownMetadataRef = useRef(null);
  const actionsRef = useRef({});
  const skipSeedRef = useRef(false);
  const callbacksRef = useRef({});
  callbacksRef.current = { onModeChange, onProposalEvent, onRemoteDiscussion };

  const startRole = roleHint === "editor" || roleHint === "viewer" ? roleHint : "owner";
  const [status, setStatus] = useState("idle");
  const [role, setRole] = useState(startRole);
  const [workMode, setWorkMode] = useState(initialWorkMode || "live");
  const [participants, setParticipants] = useState([]);
  const [error, setError] = useState("");
  const [pendingUpdates, setPendingUpdates] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  // "none": changes sync live. "draft": private draft in commit mode.
  // "choose": owner went back to live mode and this person has unsent draft changes.
  const [draftState, setDraftState] = useState("none");
  const [draftSummary, setDraftSummary] = useState(null);
  const [resetNonce, setResetNonce] = useState(0);

  useEffect(() => {
    if (!enabled || !boardId || !localUserId) {
      setStatus("idle");
      setParticipants([]);
      return undefined;
    }

    let disposed = false;
    let socket;
    let provider;
    let doc;
    let baseDoc = null; // replica of the shared room, kept only while drafting
    let elementsMap;
    let filesMap;
    let metadataMap;
    let noteMetadataMap;
    let noteContentMap;
    let projectItemsMap;
    let designStudioMap;
    let lastAppliedNotesSignature = "";
    let lastAppliedProjectSignature = "";
    let lastAppliedDesignSignature = "";
    let observeRemote;
    let observeDocumentUpdate;
    let handleLocalUpdate;
    let retryTimer = null;
    let recountTimer = null;
    let rejoinTimer = null;
    let retryDelay = 1200;
    let needsFullSync = false;
    let awaitingChoice = false;
    let currentRole = startRole;
    let currentMode = initialWorkMode || "live";
    knownElementValuesRef.current = new Map();
    knownElementVersionsRef.current = new Map();
    knownFileValuesRef.current = new Map();
    knownFileRefsRef.current = new Map();
    knownMetadataRef.current = null;
    const roomId = String(boardId);
    setDraftState("none");
    setDraftSummary(null);

    const isDraft = () => currentMode === "commit" && currentRole === "editor";
    const isPrivate = () => isDraft() || awaitingChoice;

    const destroyBase = () => {
      if (baseDoc) baseDoc.destroy();
      baseDoc = null;
    };

    const recountDraft = () => {
      if (disposed || !doc || !baseDoc) return;
      const summary = summarizeDocDifference(baseDoc, doc);
      setDraftSummary(summary.total > 0 ? summary : null);
      if (summary.total === 0) writeDraftFlag(localUserId, roomId, false);
    };
    const scheduleRecount = () => {
      window.clearTimeout(recountTimer);
      recountTimer = window.setTimeout(recountDraft, 350);
    };

    const applyRemoteScene = () => {
      if (disposed || !doc) return;
      const scene = readSceneFromYjs(doc, initialScene?.appState || {});
      knownElementValuesRef.current = new Map(elementsMap.entries());
      knownElementVersionsRef.current = new Map([...elementsMap.entries()].map(([id, value]) => {
        try {
          const element = JSON.parse(value);
          return [id, { version: element.version, versionNonce: element.versionNonce, serialized: value }];
        } catch {
          return [id, { version: null, versionNonce: null, serialized: value }];
        }
      }));
      knownFileValuesRef.current = new Map(filesMap.entries());
      knownFileRefsRef.current = new Map();
      knownMetadataRef.current = metadataMap.get("appState") ?? null;
      onRemoteScene?.(scene);
    };

    const applyRemoteNotes = () => {
      if (disposed || !doc) return;
      const notes = readNotesFromYjs(doc);
      const signature = JSON.stringify(notes);
      if (signature === lastAppliedNotesSignature) return;
      lastAppliedNotesSignature = signature;
      onRemoteNotes?.(notes);
    };

    const applyRemoteProjectItems = () => {
      if (disposed || !doc) return;
      const items = readProjectItemsFromYjs(doc);
      const signature = JSON.stringify(items);
      if (signature === lastAppliedProjectSignature) return;
      lastAppliedProjectSignature = signature;
      onRemoteProjectItems?.(items);
    };

    const applyRemoteDesignStudio = () => {
      if (disposed || !doc) return;
      const designStudio = readDesignStudioFromYjs(doc);
      const signature = JSON.stringify(designStudio);
      if (signature === lastAppliedDesignSignature) return;
      lastAppliedDesignSignature = signature;
      onRemoteDesignStudio?.(designStudio);
    };

    let lastAppliedDiscussionSignature = "";
    const applyRemoteDiscussion = () => {
      if (disposed || !doc) return;
      const discussion = readRoomDiscussion(doc);
      const signature = JSON.stringify(discussion);
      if (signature === lastAppliedDiscussionSignature) return;
      lastAppliedDiscussionSignature = signature;
      callbacksRef.current.onRemoteDiscussion?.(discussion);
    };

    const addParticipant = (participant) => {
      if (!participant?.userId) return;
      setParticipants((current) => {
        const next = current.filter((item) => item.userId !== participant.userId);
        return [...next, participant];
      });
    };

    const removeParticipant = (userId) => {
      setParticipants((current) => current.filter((item) => item.userId !== userId));
    };

    async function start() {
      doc = new Y.Doc();
      docRef.current = doc;
      provider = new IndexeddbPersistence(`arcdraw:${localUserId}:board:${roomId}`, doc);
      await new Promise((resolve) => provider.once("synced", resolve));
      if (disposed) return;

      elementsMap = doc.getMap("arcdraw.elements.v1");
      filesMap = doc.getMap("arcdraw.files.v1");
      metadataMap = doc.getMap("arcdraw.metadata.v1");
      noteMetadataMap = doc.getMap("arcdraw.notes.metadata.v1");
      noteContentMap = doc.getMap("arcdraw.notes.content.v1");
      projectItemsMap = doc.getMap("arcdraw.project.items.v1");
      designStudioMap = doc.getMap("arcdraw.design.studio.v1");
      observeRemote = (_event, transaction) => {
        if (transaction.origin === REMOTE_SCENE_ORIGIN) applyRemoteScene();
      };
      elementsMap.observe(observeRemote);
      filesMap.observe(observeRemote);
      metadataMap.observe(observeRemote);

      // Never copy a local snapshot into a draft: those copies would look like
      // this person's own edits and could overwrite newer owner changes on merge.
      const skipSeed = skipSeedRef.current || isDraft();
      skipSeedRef.current = false;
      if (!skipSeed) {
        if (!hasYjsScene(doc) && initialScene) {
          writeSceneToYjs(doc, initialScene, LOCAL_SCENE_ORIGIN);
        }
        if (noteMetadataMap.size === 0 && initialNotes?.length) {
          writeNotesToYjs(doc, initialNotes, LOCAL_SCENE_ORIGIN);
        }
        if (projectItemsMap.size === 0 && initialProjectItems?.length) {
          writeProjectItemsToYjs(doc, initialProjectItems, LOCAL_SCENE_ORIGIN);
        }
        if (!designStudioMap.has("document") && !designStudioMap.has("tokens") && !designStudioMap.has("components")) {
          writeDesignStudioToYjs(doc, initialDesignStudio, LOCAL_SCENE_ORIGIN);
        }
      }
      observeDocumentUpdate = (_update, origin) => {
        if (origin === REMOTE_SCENE_ORIGIN) {
          applyRemoteNotes();
          applyRemoteProjectItems();
          applyRemoteDesignStudio();
          applyRemoteDiscussion();
        }
      };
      doc.on("update", observeDocumentUpdate);
      knownElementValuesRef.current = new Map(elementsMap.entries());
      knownElementVersionsRef.current = new Map([...elementsMap.entries()].map(([id, value]) => {
        try {
          const element = JSON.parse(value);
          return [id, { version: element.version, versionNonce: element.versionNonce, serialized: value }];
        } catch {
          return [id, { version: null, versionNonce: null, serialized: value }];
        }
      }));
      knownFileValuesRef.current = new Map(filesMap.entries());
      knownFileRefsRef.current = new Map();
      knownMetadataRef.current = metadataMap.get("appState") ?? null;
      // IndexedDB may already contain discussion changes queued while offline.
      // Hydrate the panel before attempting the network connection.
      applyRemoteDiscussion();

      socket = io(API_ORIGIN, {
        withCredentials: true,
        // Start with polling and upgrade to WebSocket after the session is
        // established. This avoids failing the initial room connection on
        // dev proxies, restrictive networks, and hosts without WS upgrades.
        transports: ["polling", "websocket"],
        tryAllTransports: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 700,
        reconnectionDelayMax: 5000
      });
      socketRef.current = socket;
      setStatus("connecting");
      setError("");

      const scheduleFullSyncRetry = () => {
        if (retryTimer || disposed || !needsFullSync || currentRole === "viewer" || isPrivate()) return;
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          // A reconnect performs a full sync in the connect handler. Leave the
          // local Y.Doc intact while disconnected; never clear its pending flag.
          if (disposed || !socket?.connected || !joinedRef.current || !doc || isPrivate()) return;
          socket.emit("board:sync", {
            boardId: roomId,
            update: encodeUpdateBase64(Y.encodeStateAsUpdate(doc))
          }, (result) => {
            if (disposed) return;
            if (result?.ok) {
              needsFullSync = false;
              retryDelay = 1200;
              setPendingUpdates(0);
              setStatus("connected");
              setError("");
              setLastSyncedAt(new Date().toISOString());
            } else if (result?.code === "COMMIT_MODE") {
              requestRejoin();
            } else {
              needsFullSync = true;
              retryDelay = Math.min(retryDelay * 2, 15000);
              setPendingUpdates(1);
              setStatus("error");
              setError(result?.message || "Cloud save failed. Retrying automatically.");
              scheduleFullSyncRetry();
            }
          });
        }, retryDelay);
      };

      // The owner switched modes while this editor had changes in flight. Ask
      // the server where things stand instead of guessing.
      function requestRejoin() {
        if (rejoinTimer || disposed) return;
        rejoinTimer = window.setTimeout(() => {
          rejoinTimer = null;
          joinRoom();
        }, 150);
      }

      const sendFullSync = () => {
        socket.emit("board:sync", { boardId: roomId, update: encodeUpdateBase64(Y.encodeStateAsUpdate(doc)) }, (syncResult) => {
          if (disposed) return;
          if (syncResult?.ok) {
            needsFullSync = false;
            if (retryTimer) window.clearTimeout(retryTimer);
            retryTimer = null;
            setStatus("connected");
            setPendingUpdates(0);
            setError("");
            setLastSyncedAt(new Date().toISOString());
          } else if (syncResult?.code === "COMMIT_MODE") {
            requestRejoin();
          } else {
            needsFullSync = true;
            setPendingUpdates(1);
            setStatus("error");
            setError(syncResult?.message || "Initial synchronization failed.");
            scheduleFullSyncRetry();
          }
        });
      };

      handleLocalUpdate = (update, origin) => {
        if (disposed || origin !== LOCAL_SCENE_ORIGIN || currentRole === "viewer") return;
        if (isPrivate()) {
          // Private draft: keep it on this device and count what differs.
          writeDraftFlag(localUserId, roomId, true);
          scheduleRecount();
          return;
        }
        if (!joinedRef.current || !socket?.connected) {
          needsFullSync = true;
          setPendingUpdates((count) => Math.max(count, 1));
          return;
        }
        setPendingUpdates((count) => count + 1);
        socket.emit("board:update", { boardId: roomId, update: encodeUpdateBase64(update) }, (result) => {
          if (disposed) return;
          if (result?.ok) {
            setPendingUpdates((count) => Math.max(needsFullSync ? 1 : 0, count - 1));
            if (!needsFullSync) {
              setStatus("connected");
              setError("");
              setLastSyncedAt(new Date().toISOString());
              retryDelay = 1200;
            }
          } else if (result?.code === "COMMIT_MODE") {
            // The room just moved to commit mode. Switch to a private draft.
            currentMode = "commit";
            setWorkMode("commit");
            requestRejoin();
          } else {
            needsFullSync = true;
            setPendingUpdates(1);
            setStatus("error");
            setError(result?.message || "A change couldn't be saved to the cloud. Retrying automatically.");
            scheduleFullSyncRetry();
          }
        });
      };
      doc.on("update", handleLocalUpdate);

      function joinRoom() {
        if (disposed || !socket) return;
        setStatus("connecting");
        socket.emit("board:join", { boardId: roomId, shareToken }, (result) => {
          if (disposed) return;
          if (!result?.ok) {
            joinedRef.current = false;
            setStatus("error");
            setError(result?.message || "You don't have access to this room.");
            return;
          }
          joinedRef.current = true;
          currentRole = result.role || "viewer";
          const previousMode = currentMode;
          currentMode = result.workMode || "live";
          setRole(currentRole);
          setWorkMode(currentMode);
          setParticipants(result.participants || []);
          if (previousMode !== currentMode) callbacksRef.current.onModeChange?.(currentMode, previousMode);
          if (result.snapshot) Y.applyUpdate(doc, decodeUpdateBase64(result.snapshot), REMOTE_SCENE_ORIGIN);
          applyRemoteScene();
          if (noteMetadataMap.size > 0) applyRemoteNotes();
          if (projectItemsMap.size > 0) applyRemoteProjectItems();
          if (designStudioMap.has("document") || designStudioMap.has("tokens") || designStudioMap.has("components")) applyRemoteDesignStudio();
          applyRemoteDiscussion();

          // Viewers receive the authoritative room snapshot and live updates,
          // but never upload a local replica or show queued write indicators.
          if (currentRole === "viewer") {
            needsFullSync = false;
            if (retryTimer) window.clearTimeout(retryTimer);
            retryTimer = null;
            setPendingUpdates(0);
            setStatus("connected");
            return;
          }

          // Commit mode, editor: keep a copy of the shared room as the baseline
          // and never upload. Changes leave only when submitted for review.
          if (isDraft()) {
            destroyBase();
            baseDoc = new Y.Doc();
            if (result.snapshot) Y.applyUpdate(baseDoc, decodeUpdateBase64(result.snapshot), REMOTE_SCENE_ORIGIN);
            awaitingChoice = false;
            needsFullSync = false;
            if (retryTimer) window.clearTimeout(retryTimer);
            retryTimer = null;
            setDraftState("draft");
            setPendingUpdates(0);
            setStatus("connected");
            setError("");
            recountDraft();
            return;
          }

          // Live mode. An editor who still holds draft changes from commit mode
          // decides what happens to them instead of having them sent silently.
          if (currentRole === "editor" && (baseDoc || readDraftFlag(localUserId, roomId))) {
            const probe = baseDoc || new Y.Doc();
            if (!baseDoc && result.snapshot) Y.applyUpdate(probe, decodeUpdateBase64(result.snapshot));
            const summary = summarizeDocDifference(probe, doc);
            if (probe !== baseDoc) probe.destroy();
            destroyBase();
            if (summary.total > 0) {
              awaitingChoice = true;
              needsFullSync = false;
              setDraftState("choose");
              setDraftSummary(summary);
              setPendingUpdates(0);
              setStatus("connected");
              setError("");
              return;
            }
            writeDraftFlag(localUserId, roomId, false);
          }
          destroyBase();
          awaitingChoice = false;
          setDraftState("none");
          setDraftSummary(null);
          sendFullSync();
        });
      }

      socket.on("connect", joinRoom);

      socket.on("disconnect", () => {
        joinedRef.current = false;
        setStatus("offline");
        if (currentRole !== "viewer" && !isPrivate()) {
          needsFullSync = true;
          setPendingUpdates((count) => Math.max(count, 1));
        }
      });

      socket.on("connect_error", (cause) => {
        joinedRef.current = false;
        setStatus("error");
        const message = cause?.message || "Collaboration server unavailable.";
        const transportUnavailable = /xhr poll error|websocket error|websocket is closed/i.test(message);
        setError(transportUnavailable
          ? "Can't reach the Arcdraw server right now. Your edits stay saved on this device and will sync when it is back."
          : message);
        if (currentRole !== "viewer" && !isPrivate()) {
          needsFullSync = true;
          setPendingUpdates((count) => Math.max(count, 1));
        }
      });

      socket.on("board:update", ({ update }) => {
        if (disposed || !update) return;
        const bytes = decodeUpdateBase64(update);
        Y.applyUpdate(doc, bytes, REMOTE_SCENE_ORIGIN);
        if (baseDoc) {
          Y.applyUpdate(baseDoc, bytes, REMOTE_SCENE_ORIGIN);
          scheduleRecount();
        }
      });

      // The owner changed how the room works.
      socket.on("board:mode", (payload) => {
        if (disposed) return;
        const next = payload?.workMode === "commit" ? "commit" : "live";
        const previous = currentMode;
        if (next === previous) return;
        // Owners and viewers only need to know the label changed. Editors
        // rejoin so they get the authoritative room state for their new mode.
        if (currentRole === "owner" || currentRole === "viewer") {
          currentMode = next;
          setWorkMode(next);
          callbacksRef.current.onModeChange?.(next, previous);
          return;
        }
        requestRejoin();
      });

      socket.on("board:proposal:new", (payload) => callbacksRef.current.onProposalEvent?.("new", payload));
      socket.on("board:proposal:resolved", (payload) => callbacksRef.current.onProposalEvent?.("resolved", payload));

      socket.on("board:access:revoked", (payload) => {
        if (disposed) return;
        joinedRef.current = false;
        currentRole = "viewer";
        needsFullSync = false;
        setRole("revoked");
        setParticipants([]);
        setPendingUpdates(0);
        setStatus("error");
        setError(payload?.message || "Your access to this shared room was revoked.");
        socket.disconnect();
      });
      socket.on("board:presence:join", addParticipant);
      socket.on("board:presence:leave", ({ userId }) => removeParticipant(userId));
      socket.on("board:presence:pointer", addParticipant);

      // Actions that need this effect's private state.
      actionsRef.current = {
        isPrivateDraft: isPrivate,
        submit(message) {
          return new Promise((resolve, reject) => {
            if (!isDraft() || !baseDoc) {
              reject(new Error("Changes can only be submitted for review in commit mode."));
              return;
            }
            if (!socket?.connected || !joinedRef.current) {
              reject(new Error("Reconnect to the room before submitting your changes."));
              return;
            }
            const update = Y.encodeStateAsUpdate(doc, Y.encodeStateVector(baseDoc));
            socket.emit("board:propose", { boardId: roomId, message, update: encodeUpdateBase64(update) }, (result) => {
              if (result?.ok) {
                resolve(result.proposal);
              } else {
                const failure = new Error(result?.message || "Couldn't submit your changes.");
                failure.code = result?.code;
                reject(failure);
              }
            });
          });
        },
        async discard() {
          writeDraftFlag(localUserId, roomId, false);
          // Clear the private copy and rebuild from the shared room.
          skipSeedRef.current = true;
          try { await provider.clearData(); } catch (cause) { console.error("Could not clear draft data:", cause); }
          setResetNonce((value) => value + 1);
        },
        sendDraftToRoom() {
          if (!awaitingChoice) return;
          awaitingChoice = false;
          writeDraftFlag(localUserId, roomId, false);
          setDraftState("none");
          setDraftSummary(null);
          needsFullSync = true;
          if (joinedRef.current && socket?.connected) sendFullSync();
        }
      };
    }

    start().catch((cause) => {
      if (!disposed) {
        setStatus("error");
        setError(cause.message || "Could not start local collaboration storage.");
      }
    });

    return () => {
      disposed = true;
      joinedRef.current = false;
      actionsRef.current = {};
      if (elementsMap && observeRemote) elementsMap.unobserve(observeRemote);
      if (filesMap && observeRemote) filesMap.unobserve(observeRemote);
      if (metadataMap && observeRemote) metadataMap.unobserve(observeRemote);
      if (doc && observeDocumentUpdate) doc.off("update", observeDocumentUpdate);
      if (doc && handleLocalUpdate) doc.off("update", handleLocalUpdate);
      if (retryTimer) window.clearTimeout(retryTimer);
      window.clearTimeout(recountTimer);
      window.clearTimeout(rejoinTimer);
      socket?.disconnect();
      socketRef.current = null;
      try { provider?.destroy(); } catch { /* already closed */ }
      destroyBase();
      doc?.destroy();
      docRef.current = null;
    };
  }, [boardId, localUserId, shareToken, enabled, resetNonce]);

  const publishScene = useCallback((scene) => {
    const doc = docRef.current;
    if (!doc) return;

    const nextElements = new Map();
    const nextElementVersions = new Map();
    const upsertElementIds = [];
    for (const element of (scene.elements || [])) {
      if (!element?.id) continue;
      const previous = knownElementVersionsRef.current.get(element.id);
      const canUseVersion = Number.isFinite(element.version) && Number.isFinite(element.versionNonce);
      const sameVersion = canUseVersion && previous
        && previous.version === element.version
        && previous.versionNonce === element.versionNonce;
      let serialized = sameVersion ? previous.serialized : JSON.stringify(element);
      const knownValue = knownElementValuesRef.current.get(element.id);
      // Same content written with a different key order is not a change. Without
      // this check, opening a room would re-write every element and could
      // overwrite another person's newer edit with an old copy.
      if (knownValue !== undefined && knownValue !== serialized && canonicalJson(knownValue) === canonicalJson(serialized)) {
        serialized = knownValue;
      }
      nextElements.set(element.id, serialized);
      nextElementVersions.set(element.id, {
        version: element.version,
        versionNonce: element.versionNonce,
        serialized
      });
      if (knownElementValuesRef.current.get(element.id) !== serialized) upsertElementIds.push(element.id);
    }
    const deleteElementIds = [...knownElementValuesRef.current.keys()]
      .filter((id) => !nextElements.has(id));

    const nextFiles = new Map();
    const nextFileRefs = new Map();
    const upsertFileIds = [];
    for (const [id, file] of Object.entries(scene.files || {})) {
      const previousRef = knownFileRefsRef.current.get(id);
      let serialized = previousRef === file ? knownFileValuesRef.current.get(id) : JSON.stringify(file);
      const knownFile = knownFileValuesRef.current.get(id);
      if (knownFile !== undefined && serialized !== knownFile && canonicalJson(knownFile) === canonicalJson(serialized)) {
        serialized = knownFile;
      }
      nextFiles.set(id, serialized);
      nextFileRefs.set(id, file);
      if (knownFileValuesRef.current.get(id) !== serialized) upsertFileIds.push(id);
    }
    const deleteFileIds = [...knownFileValuesRef.current.keys()]
      .filter((id) => !nextFiles.has(id));

    const appState = scene.appState || {};
    const metadata = JSON.stringify({
      viewBackgroundColor: appState.viewBackgroundColor || "#ffffff",
      gridSize: appState.gridSize ?? null
    });
    const includeMetadata = knownMetadataRef.current !== metadata;

    writeSceneToYjs(doc, scene, LOCAL_SCENE_ORIGIN, {
      upsertElementIds,
      deleteElementIds,
      upsertFileIds,
      deleteFileIds,
      includeMetadata
    });

    // Advance the local baseline only to what this editor has actually seen.
    // Remote observer callbacks refresh this baseline before another edit.
    knownElementValuesRef.current = nextElements;
    knownElementVersionsRef.current = nextElementVersions;
    knownFileValuesRef.current = nextFiles;
    knownFileRefsRef.current = nextFileRefs;
    if (includeMetadata) knownMetadataRef.current = metadata;
  }, []);

  const publishNotes = useCallback((notes) => {
    const doc = docRef.current;
    if (!doc) return;
    writeNotesToYjs(doc, notes, LOCAL_SCENE_ORIGIN);
  }, []);

  // Publish text edits directly to the shared Y.Text as the user types. Dexie
  // still receives the debounced durable local copy from Notes Studio.
  const updateNoteContent = useCallback((noteId, content) => {
    const doc = docRef.current;
    if (!doc) return false;
    updateNoteContentInYjs(doc, noteId, content, LOCAL_SCENE_ORIGIN);
    return true;
  }, []);

  const publishProjectItems = useCallback((items) => {
    const doc = docRef.current;
    if (!doc) return;
    writeProjectItemsToYjs(doc, items, LOCAL_SCENE_ORIGIN);
  }, []);

  const publishDesignStudio = useCallback((designStudio) => {
    const doc = docRef.current;
    if (!doc) return;
    writeDesignStudioToYjs(doc, designStudio, LOCAL_SCENE_ORIGIN);
  }, []);

  const publishMessage = useCallback((message) => {
    const doc = docRef.current;
    if (!doc) return false;
    writeRoomMessage(doc, message, LOCAL_SCENE_ORIGIN);
    return true;
  }, []);

  const publishComment = useCallback((comment) => {
    const doc = docRef.current;
    if (!doc) return false;
    writeRoomComment(doc, comment, LOCAL_SCENE_ORIGIN);
    return true;
  }, []);

  const flushToServer = useCallback(() => new Promise((resolve, reject) => {
    const doc = docRef.current;
    const socket = socketRef.current;
    // A private draft never uploads on its own, so there is nothing to flush.
    if (actionsRef.current.isPrivateDraft?.()) {
      resolve(false);
      return;
    }
    if (!doc || !socket?.connected || !joinedRef.current) {
      reject(new Error("Connect to the room before syncing changes."));
      return;
    }
    socket.emit("board:sync", {
      boardId: String(boardId),
      update: encodeUpdateBase64(Y.encodeStateAsUpdate(doc))
    }, (result) => result?.ok ? resolve(true) : reject(new Error(result?.message || "Could not sync the latest changes.")));
  }), [boardId]);

  const broadcastPointer = useCallback((pointer) => {
    const now = Date.now();
    if (now - lastPointerAt.current < 45) return;
    lastPointerAt.current = now;
    const socket = socketRef.current;
    if (socket?.connected && joinedRef.current && Number.isFinite(pointer?.x) && Number.isFinite(pointer?.y)) {
      socket.volatile.emit("board:presence", { boardId: String(boardId), x: pointer.x, y: pointer.y });
    }
  }, [boardId]);

  const submitDraft = useCallback((message) => {
    if (!actionsRef.current.submit) return Promise.reject(new Error("The room is not ready yet."));
    return actionsRef.current.submit(message);
  }, []);

  const discardDraft = useCallback(() => (
    actionsRef.current.discard ? actionsRef.current.discard() : Promise.resolve()
  ), []);

  const sendDraftToRoom = useCallback(() => {
    if (actionsRef.current.sendDraftToRoom) actionsRef.current.sendDraftToRoom();
  }, []);

  return {
    status, role, workMode, participants, error, pendingUpdates, lastSyncedAt,
    draftState, draftSummary,
    publishScene, publishNotes, updateNoteContent, publishProjectItems, publishDesignStudio,
    publishMessage, publishComment,
    flushToServer, broadcastPointer, submitDraft, discardDraft, sendDraftToRoom
  };
}
