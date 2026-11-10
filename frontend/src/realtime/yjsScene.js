import * as Y from "yjs";

export const LOCAL_SCENE_ORIGIN = "arcdraw-local-scene";
export const REMOTE_SCENE_ORIGIN = "arcdraw-remote-scene";
const DISCUSSION_MESSAGES_MAP = "arcdraw.discussion.messages.v1";
const DISCUSSION_COMMENTS_MAP = "arcdraw.discussion.comments.v1";

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function getTypes(doc) {
  return {
    elements: doc.getMap("arcdraw.elements.v1"),
    files: doc.getMap("arcdraw.files.v1"),
    metadata: doc.getMap("arcdraw.metadata.v1")
  };
}

export function hasYjsScene(doc) {
  const scene = getTypes(doc);
  const notes = getNoteMaps(doc);
  return scene.elements.size > 0
    || scene.files.size > 0
    || scene.metadata.size > 0
    || notes.metadata.size > 0
    || doc.getMap(PROJECT_ITEMS_MAP).size > 0
    || doc.getMap(DESIGN_STUDIO_MAP).size > 0
    || doc.getMap(DISCUSSION_MESSAGES_MAP).size > 0
    || doc.getMap(DISCUSSION_COMMENTS_MAP).size > 0;
}

export function writeSceneToYjs(doc, scene, origin = LOCAL_SCENE_ORIGIN, {
  upsertElementIds = null,
  deleteElementIds = [],
  upsertFileIds = null,
  deleteFileIds = [],
  includeMetadata = true
} = {}) {
  const maps = getTypes(doc);
  const elementFilter = upsertElementIds === null ? null : new Set(upsertElementIds);
  const fileFilter = upsertFileIds === null ? null : new Set(upsertFileIds);
  const elementEntries = new Map((scene.elements || [])
    .filter((element) => element?.id && (!elementFilter || elementFilter.has(element.id)))
    .map((element) => [element.id, JSON.stringify(element)]));
  const files = scene.files || {};
  const fileEntries = new Map(Object.entries(files)
    .filter(([id]) => !fileFilter || fileFilter.has(id))
    .map(([id, file]) => [id, JSON.stringify(file)]));

  // A canvas callback gives us the complete scene, but a collaboration update
  // must contain only this client's changed records. Otherwise a stale copy of
  // element B could overwrite another user's simultaneous edit to element B
  // while this client was only changing element A.
  doc.transact(() => {
    for (const id of deleteElementIds) maps.elements.delete(id);
    for (const [key, value] of elementEntries) {
      if (maps.elements.get(key) !== value) maps.elements.set(key, value);
    }
    for (const id of deleteFileIds) maps.files.delete(id);
    for (const [key, value] of fileEntries) {
      if (maps.files.get(key) !== value) maps.files.set(key, value);
    }
    if (includeMetadata) {
      const appState = scene.appState || {};
      const metadata = JSON.stringify({ viewBackgroundColor: appState.viewBackgroundColor || "#ffffff", gridSize: appState.gridSize ?? null });
      if (maps.metadata.get("appState") !== metadata) maps.metadata.set("appState", metadata);
    }
  }, origin);
}

export function readSceneFromYjs(doc, appState = {}) {
  const maps = getTypes(doc);
  const elements = [];
  const files = {};
  for (const value of maps.elements.values()) {
    const element = parseJson(value, null);
    if (element) elements.push(element);
  }
  elements.sort((left, right) => {
    const a = String(left.index || "");
    const b = String(right.index || "");
    return a < b ? -1 : a > b ? 1 : 0;
  });
  for (const [id, value] of maps.files.entries()) {
    const file = parseJson(value, null);
    if (file) files[id] = file;
  }
  const metadata = parseJson(maps.metadata.get("appState"), {});
  return { elements, files, appState: { ...appState, ...metadata } };
}

const VOLATILE_KEYS = new Set(["updated", "updatedAt", "version", "versionNonce"]);

function sortKeys(value, ignoreVolatile) {
  if (Array.isArray(value)) return value.map((item) => sortKeys(item, ignoreVolatile));
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      if (ignoreVolatile && VOLATILE_KEYS.has(key)) continue;
      sorted[key] = sortKeys(value[key], ignoreVolatile);
    }
    return sorted;
  }
  return value;
}

/**
 * Stable JSON text for a stored value: keys sorted, so two copies of the same
 * element written by different clients compare equal. Pass ignoreVolatile to
 * also ignore version counters and timestamps (used when counting real changes).
 */
export function canonicalJson(text, ignoreVolatile = false) {
  try { return JSON.stringify(sortKeys(JSON.parse(text), ignoreVolatile)); } catch { return String(text); }
}

export function encodeUpdateBase64(update) {
  let binary = "";
  for (const byte of update) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeUpdateBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export { Y };

function getNoteMaps(doc) {
  return {
    metadata: doc.getMap("arcdraw.notes.metadata.v1"),
    content: doc.getMap("arcdraw.notes.content.v1")
  };
}

function replaceYText(text, nextValue) {
  const previous = text.toString();
  const next = String(nextValue ?? "");
  if (previous === next) return;

  let prefix = 0;
  const maxPrefix = Math.min(previous.length, next.length);
  while (prefix < maxPrefix && previous[prefix] === next[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) suffix += 1;

  const deleteCount = previous.length - prefix - suffix;
  const insertValue = next.slice(prefix, next.length - suffix);
  if (deleteCount > 0) text.delete(prefix, deleteCount);
  if (insertValue) text.insert(prefix, insertValue);
}

export function readNotesFromYjs(doc) {
  const maps = getNoteMaps(doc);
  const notes = [];
  for (const [id, encoded] of maps.metadata.entries()) {
    const metadata = parseJson(encoded, null);
    if (!metadata) continue;
    const content = maps.content.get(id);
    notes.push({ ...metadata, id, content: content instanceof Y.Text ? content.toString() : String(metadata.content || "") });
  }
  return notes.sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));
}

/**
 * Store note metadata in Y.Map and note body in Y.Text.
 * Y.Text gives concurrent edits to the same note a CRDT merge instead of
 * replacing the entire note body with whichever client saved last.
 */
export function updateNoteContentInYjs(doc, noteId, value, origin = LOCAL_SCENE_ORIGIN) {
  if (!doc || !noteId) return;
  const maps = getNoteMaps(doc);
  doc.transact(() => {
    let content = maps.content.get(String(noteId));
    if (!(content instanceof Y.Text)) {
      content = new Y.Text();
      maps.content.set(String(noteId), content);
    }
    replaceYText(content, String(value ?? ""));
    const encodedMetadata = maps.metadata.get(String(noteId));
    const metadata = parseJson(encodedMetadata, null);
    if (metadata) {
      maps.metadata.set(String(noteId), JSON.stringify({ ...metadata, updatedAt: new Date().toISOString() }));
    }
  }, origin);
}

export function writeNotesToYjs(doc, notes = [], origin = LOCAL_SCENE_ORIGIN) {
  const maps = getNoteMaps(doc);
  const incoming = new Map((notes || []).filter((note) => note?.id).map((note) => [String(note.id), note]));

  doc.transact(() => {
    for (const id of [...maps.metadata.keys()]) {
      if (!incoming.has(id)) {
        maps.metadata.delete(id);
        maps.content.delete(id);
      }
    }

    for (const [id, note] of incoming) {
      const metadata = {
        title: String(note.title || "Untitled note").slice(0, 120),
        createdAt: note.createdAt || new Date().toISOString(),
        updatedAt: note.updatedAt || new Date().toISOString(),
        linkedElementId: note.linkedElementId || null
      };
      const encoded = JSON.stringify(metadata);
      if (maps.metadata.get(id) !== encoded) maps.metadata.set(id, encoded);

      let content = maps.content.get(id);
      if (!(content instanceof Y.Text)) {
        content = new Y.Text();
        maps.content.set(id, content);
        const initialContent = String(note.content || "");
        if (initialContent) content.insert(0, initialContent);
      } else if (content.length === 0 && note.content) {
        // Seed a newly attached/empty note once. Do not replace an existing
        // Y.Text from a Dexie snapshot: that snapshot can lag behind concurrent
        // edits already merged in the CRDT document.
        content.insert(0, String(note.content));
      }
    }
  }, origin);
}

const PROJECT_ITEMS_MAP = "arcdraw.project.items.v1";

export function readProjectItemsFromYjs(doc) {
  const map = doc.getMap(PROJECT_ITEMS_MAP);
  const items = [];
  for (const [id, value] of map.entries()) {
    let item = null;
    if (value instanceof Y.Map) item = Object.fromEntries(value.entries());
    else item = parseJson(value, null); // read early preview builds safely
    if (item) items.push({ ...item, id });
  }
  return items.sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));
}

/**
 * Keep a stable Y.Map per task/milestone and store each property separately.
 * This lets concurrent edits to different fields merge, while deletedAt is a
 * sticky tombstone: stale offline clients cannot clear it by resending null.
 */
export function writeProjectItemsToYjs(doc, items = [], origin = LOCAL_SCENE_ORIGIN) {
  const map = doc.getMap(PROJECT_ITEMS_MAP);
  const allowed = [
    "kind", "title", "description", "status", "priority", "assigneeId",
    "assigneeName", "dueDate", "milestoneId", "linkedElementId",
    "linkedNoteId", "parentTaskId", "dependsOnIds", "createdAt", "updatedAt"
  ];
  doc.transact(() => {
    for (const item of (items || []).filter((entry) => entry?.id)) {
      const id = String(item.id);
      let record = map.get(id);
      const isNew = !(record instanceof Y.Map);
      if (isNew) {
        const legacy = parseJson(record, null);
        record = new Y.Map();
        map.set(id, record);
        if (legacy && typeof legacy === "object") {
          for (const [key, value] of Object.entries(legacy)) record.set(key, value);
        }
      }
      // New records receive a complete baseline. Existing records only update
      // the fields explicitly included in this patch, avoiding stale replicas
      // overwriting another collaborator's unrelated field changes.
      const values = isNew ? {
        kind: item.kind === "milestone" ? "milestone" : "task",
        title: "Untitled task",
        description: "",
        status: item.kind === "milestone" ? "upcoming" : "todo",
        priority: "medium",
        assigneeId: null,
        assigneeName: null,
        dueDate: null,
        milestoneId: null,
        linkedElementId: null,
        linkedNoteId: null,
        parentTaskId: null,
        dependsOnIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } : {};
      for (const key of allowed) {
        if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
        const value = item[key];
        if (key === "kind") values[key] = value === "milestone" ? "milestone" : "task";
        else if (key === "title") values[key] = String(value || "Untitled task").slice(0, 120);
        else if (key === "description") values[key] = String(value || "").slice(0, 3000);
        else if (["assigneeId", "assigneeName", "dueDate", "milestoneId", "linkedElementId", "linkedNoteId", "parentTaskId"].includes(key)) values[key] = value || null;
        else if (key === "dependsOnIds") values[key] = Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))].slice(0, 100) : [];
        else if (key === "status") values[key] = String(value || (item.kind === "milestone" ? "upcoming" : "todo"));
        else if (key === "priority") values[key] = String(value || "medium");
        else values[key] = value || new Date().toISOString();
      }
      for (const [key, value] of Object.entries(values)) {
        if (record.get(key) !== value) record.set(key, value);
      }
      if (item.deletedAt) record.set("deletedAt", item.deletedAt);
      else if (isNew && !record.has("deletedAt")) record.set("deletedAt", null);
    }
  }, origin);
}

const DESIGN_STUDIO_MAP = "arcdraw.design.studio.v1";

function asYMap(parent, key) {
  let value = parent.get(key);
  if (!(value instanceof Y.Map)) {
    const legacy = value;
    value = new Y.Map();
    parent.set(key, value);
    const parsed = parseJson(legacy, null);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [field, fieldValue] of Object.entries(parsed)) value.set(field, fieldValue);
    }
  }
  return value;
}

function encodeStudioRecord(record) {
  return JSON.stringify(record);
}

function decodeStudioRecord(value) {
  return value instanceof Y.Map ? Object.fromEntries(value.entries()) : parseJson(value, null);
}

export function readDesignStudioFromYjs(doc) {
  const map = doc.getMap(DESIGN_STUDIO_MAP);
  // Read pre-upgrade rooms without forcing an immediate rewrite.
  const legacy = parseJson(map.get("document"), null);
  if (legacy) return {
    tokens: Array.isArray(legacy.tokens) ? legacy.tokens : [],
    components: Array.isArray(legacy.components) ? legacy.components : []
  };
  const tokensMap = map.get("tokens");
  const componentsMap = map.get("components");
  const tokens = tokensMap instanceof Y.Map ? [...tokensMap.entries()].map(([, value]) => decodeStudioRecord(value)).filter(Boolean) : [];
  const components = componentsMap instanceof Y.Map ? [...componentsMap.entries()].map(([, value]) => decodeStudioRecord(value)).filter(Boolean) : [];
  return { tokens, components };
}

export function writeDesignStudioToYjs(doc, designStudio = {}, origin = LOCAL_SCENE_ORIGIN) {
  const map = doc.getMap(DESIGN_STUDIO_MAP);
  const safe = {
    tokens: Array.isArray(designStudio.tokens) ? designStudio.tokens.slice(0, 200) : [],
    components: Array.isArray(designStudio.components) ? designStudio.components.slice(0, 200) : []
  };
  doc.transact(() => {
    const legacy = parseJson(map.get("document"), null);
    if (legacy) {
      map.delete("document");
      const oldTokens = asYMap(map, "tokens");
      const oldComponents = asYMap(map, "components");
      for (const token of Array.isArray(legacy.tokens) ? legacy.tokens : []) if (token?.id) oldTokens.set(String(token.id), encodeStudioRecord(token));
      for (const component of Array.isArray(legacy.components) ? legacy.components : []) if (component?.id) oldComponents.set(String(component.id), encodeStudioRecord(component));
    }
    const tokens = asYMap(map, "tokens");
    const components = asYMap(map, "components");
    const incomingTokens = new Map(safe.tokens.filter((item) => item?.id).map((item) => [String(item.id), item]));
    const incomingComponents = new Map(safe.components.filter((item) => item?.id).map((item) => [String(item.id), item]));
    for (const id of [...tokens.keys()]) if (!incomingTokens.has(id)) tokens.delete(id);
    for (const id of [...components.keys()]) if (!incomingComponents.has(id)) components.delete(id);
    for (const [id, item] of incomingTokens) {
      const encoded = encodeStudioRecord(item);
      if (tokens.get(id) !== encoded) tokens.set(id, encoded);
    }
    for (const [id, item] of incomingComponents) {
      const encoded = encodeStudioRecord(item);
      if (components.get(id) !== encoded) components.set(id, encoded);
    }
  }, origin);
}

function readDiscussionMap(doc, mapName) {
  const map = doc.getMap(mapName);
  const values = [];
  for (const [id, encoded] of map.entries()) {
    const record = encoded instanceof Y.Map ? Object.fromEntries(encoded.entries()) : parseJson(encoded, null);
    if (record && !record.deletedAt) values.push({ ...record, id });
  }
  return values.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}

function writeDiscussionItem(doc, mapName, item, origin = LOCAL_SCENE_ORIGIN) {
  if (!doc || !item?.id) return;
  const map = doc.getMap(mapName);
  const id = String(item.id);
  doc.transact(() => {
    let record = map.get(id);
    if (!(record instanceof Y.Map)) {
      const legacy = parseJson(record, null);
      record = new Y.Map();
      map.set(id, record);
      if (legacy && typeof legacy === "object") {
        for (const [key, value] of Object.entries(legacy)) record.set(key, value);
      }
    }
    const allowed = mapName === DISCUSSION_MESSAGES_MAP
      ? ["body", "authorId", "authorName", "authorAvatar", "createdAt", "editedAt"]
      : ["body", "authorId", "authorName", "authorAvatar", "createdAt", "editedAt", "elementId", "resolved", "parentId"];
    for (const key of allowed) {
      if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
      const value = item[key];
      if (record.get(key) !== value) record.set(key, value);
    }
    if (!record.has("createdAt")) record.set("createdAt", new Date().toISOString());
  }, origin);
}

export function readRoomMessages(doc) { return readDiscussionMap(doc, DISCUSSION_MESSAGES_MAP); }
export function readRoomComments(doc) { return readDiscussionMap(doc, DISCUSSION_COMMENTS_MAP); }
export function writeRoomMessage(doc, item, origin = LOCAL_SCENE_ORIGIN) {
  writeDiscussionItem(doc, DISCUSSION_MESSAGES_MAP, item, origin);
}
export function writeRoomComment(doc, item, origin = LOCAL_SCENE_ORIGIN) {
  writeDiscussionItem(doc, DISCUSSION_COMMENTS_MAP, item, origin);
}
export function readRoomDiscussion(doc) {
  return { messages: readRoomMessages(doc), comments: readRoomComments(doc) };
}

function countMapChanges(beforeMap, afterMap) {
  let added = 0;
  let updated = 0;
  let deleted = 0;
  for (const [id, value] of afterMap) {
    if (!beforeMap.has(id)) added += 1;
    else if (beforeMap.get(id) !== value) updated += 1;
  }
  for (const id of beforeMap.keys()) if (!afterMap.has(id)) deleted += 1;
  return { added, updated, deleted };
}

function elementMap(doc) {
  const map = new Map();
  for (const value of doc.getMap("arcdraw.elements.v1").values()) {
    const element = parseJson(value, null);
    if (element?.id && !element.isDeleted) map.set(element.id, canonicalJson(value, true));
  }
  return map;
}

/**
 * Compare a private draft document against the shared room replica and count
 * what is different. Used by commit mode so people can see how many changes
 * they are about to submit. Values are compared, not edit history, so a change
 * that was undone does not count.
 */
export function summarizeDocDifference(baseDoc, draftDoc) {
  const empty = { added: 0, updated: 0, deleted: 0 };
  if (!baseDoc || !draftDoc) return { elements: empty, files: empty, notes: empty, projectItems: empty, messages: empty, comments: empty, designStudio: empty, total: 0 };
  const elements = countMapChanges(elementMap(baseDoc), elementMap(draftDoc));
  const files = countMapChanges(
    new Map([...baseDoc.getMap("arcdraw.files.v1").entries()].map(([id, value]) => [id, canonicalJson(value)])),
    new Map([...draftDoc.getMap("arcdraw.files.v1").entries()].map(([id, value]) => [id, canonicalJson(value)]))
  );
  const noteList = (doc) => new Map(readNotesFromYjs(doc).map((note) => [note.id, JSON.stringify({ title: note.title, content: note.content, linkedElementId: note.linkedElementId || null })]));
  const notes = countMapChanges(noteList(baseDoc), noteList(draftDoc));
  const itemList = (doc) => new Map(readProjectItemsFromYjs(doc).filter((item) => !item.deletedAt).map((item) => {
    const { updatedAt, ...rest } = item;
    return [item.id, JSON.stringify(rest)];
  }));
  const projectItems = countMapChanges(itemList(baseDoc), itemList(draftDoc));
  const discussionMap = (doc, mapName) => new Map(readDiscussionMap(doc, mapName).map((item) => {
    const { updatedAt, editedAt, ...rest } = item;
    return [item.id, JSON.stringify(rest)];
  }));
  const messages = countMapChanges(discussionMap(baseDoc, DISCUSSION_MESSAGES_MAP), discussionMap(draftDoc, DISCUSSION_MESSAGES_MAP));
  const comments = countMapChanges(discussionMap(baseDoc, DISCUSSION_COMMENTS_MAP), discussionMap(draftDoc, DISCUSSION_COMMENTS_MAP));
  const studioList = (doc) => {
    const value = readDesignStudioFromYjs(doc);
    return new Map([
      ...(value.tokens || []).map((item) => [`token:${item.id}`, JSON.stringify(item)]),
      ...(value.components || []).map((item) => [`component:${item.id}`, JSON.stringify(item)])
    ]);
  };
  const designStudio = countMapChanges(studioList(baseDoc), studioList(draftDoc));
  const total = [elements, files, notes, projectItems, messages, comments, designStudio].reduce((sum, part) => sum + part.added + part.updated + part.deleted, 0);
  return { elements, files, notes, projectItems, messages, comments, designStudio, total };
}
