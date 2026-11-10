import * as Y from "yjs";

const LOCAL_SERVER_ORIGIN = "arcdraw-server-scene";

function safeParse(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function getMaps(doc) {
  return {
    elements: doc.getMap("arcdraw.elements.v1"),
    files: doc.getMap("arcdraw.files.v1"),
    metadata: doc.getMap("arcdraw.metadata.v1"),
    noteMetadata: doc.getMap("arcdraw.notes.metadata.v1"),
    noteContent: doc.getMap("arcdraw.notes.content.v1"),
    projectItems: doc.getMap("arcdraw.project.items.v1"),
    designStudio: doc.getMap("arcdraw.design.studio.v1"),
    messages: doc.getMap("arcdraw.discussion.messages.v1"),
    comments: doc.getMap("arcdraw.discussion.comments.v1")
  };
}

function replaceNoteText(text, value) {
  const previous = text.toString();
  const next = String(value ?? "");
  if (previous === next) return;
  let prefix = 0;
  while (prefix < Math.min(previous.length, next.length) && previous[prefix] === next[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < previous.length - prefix && suffix < next.length - prefix && previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix += 1;
  const removeLength = previous.length - prefix - suffix;
  const insertValue = next.slice(prefix, next.length - suffix);
  if (removeLength) text.delete(prefix, removeLength);
  if (insertValue) text.insert(prefix, insertValue);
}

function writeProjectItemsToYDoc(doc, items = [], origin = LOCAL_SERVER_ORIGIN, { replace = false } = {}) {
  const map = getMaps(doc).projectItems;
  const allowed = [
    "kind", "title", "description", "status", "priority", "assigneeId",
    "assigneeName", "dueDate", "milestoneId", "linkedElementId",
    "linkedNoteId", "parentTaskId", "dependsOnIds", "createdAt", "updatedAt"
  ];
  doc.transact(() => {
    const incoming = (items || []).filter((entry) => entry?.id);
    const incomingIds = new Set(incoming.map((item) => String(item.id)));
    if (replace) {
      const deletedAt = new Date().toISOString();
      for (const [id, existing] of map.entries()) {
        if (incomingIds.has(id)) continue;
        let record = existing;
        if (!(record instanceof Y.Map)) {
          const legacy = typeof record === "string" ? safeParse(record, null) : null;
          record = new Y.Map();
          if (legacy && typeof legacy === "object") {
            for (const [key, value] of Object.entries(legacy)) record.set(key, value);
          }
          map.set(id, record);
        }
        record.set("deletedAt", deletedAt);
        record.set("updatedAt", deletedAt);
      }
    }
    for (const item of incoming) {
      const id = String(item.id);
      let record = map.get(id);
      const isNew = !(record instanceof Y.Map);
      if (isNew) {
        const legacy = typeof record === "string" ? safeParse(record, null) : null;
        record = new Y.Map();
        map.set(id, record);
        if (legacy && typeof legacy === "object") {
          for (const [key, value] of Object.entries(legacy)) record.set(key, value);
        }
      }
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
      else if (replace && record.has("deletedAt")) record.set("deletedAt", null);
      else if (isNew && !record.has("deletedAt")) record.set("deletedAt", null);
    }
  }, origin);
}

function writeNotesToYDoc(doc, notes = [], origin = LOCAL_SERVER_ORIGIN) {
  const maps = getMaps(doc);
  const incoming = new Map((notes || []).filter((note) => note?.id).map((note) => [String(note.id), note]));
  doc.transact(() => {
    for (const id of [...maps.noteMetadata.keys()]) {
      if (!incoming.has(id)) {
        maps.noteMetadata.delete(id);
        maps.noteContent.delete(id);
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
      if (maps.noteMetadata.get(id) !== encoded) maps.noteMetadata.set(id, encoded);
      let content = maps.noteContent.get(id);
      if (!(content instanceof Y.Text)) {
        content = new Y.Text();
        maps.noteContent.set(id, content);
      }
      replaceNoteText(content, String(note.content || ""));
    }
  }, origin);
}

function readStudioRecord(value) {
  if (value instanceof Y.Map) return Object.fromEntries(value.entries());
  return safeParse(value, null);
}

function readDesignStudio(maps) {
  const legacy = safeParse(maps.designStudio.get("document"), null);
  if (legacy) return {
    tokens: Array.isArray(legacy.tokens) ? legacy.tokens : [],
    components: Array.isArray(legacy.components) ? legacy.components : []
  };
  const tokens = maps.designStudio.get("tokens");
  const components = maps.designStudio.get("components");
  return {
    tokens: tokens instanceof Y.Map ? [...tokens.values()].map(readStudioRecord).filter(Boolean) : [],
    components: components instanceof Y.Map ? [...components.values()].map(readStudioRecord).filter(Boolean) : []
  };
}

function writeDesignStudioToYDoc(doc, value, origin) {
  const map = doc.getMap("arcdraw.design.studio.v1");
  const legacy = safeParse(map.get("document"), null);
  doc.transact(() => {
    if (legacy) {
      map.delete("document");
      const tokenMap = new Y.Map();
      const componentMap = new Y.Map();
      for (const item of (legacy.tokens || [])) if (item?.id) tokenMap.set(String(item.id), JSON.stringify(item));
      for (const item of (legacy.components || [])) if (item?.id) componentMap.set(String(item.id), JSON.stringify(item));
      map.set("tokens", tokenMap);
      map.set("components", componentMap);
    }
    let tokenMap = map.get("tokens");
    if (!(tokenMap instanceof Y.Map)) { tokenMap = new Y.Map(); map.set("tokens", tokenMap); }
    let componentMap = map.get("components");
    if (!(componentMap instanceof Y.Map)) { componentMap = new Y.Map(); map.set("components", componentMap); }
    const tokens = new Map((value?.tokens || []).filter((item) => item?.id).map((item) => [String(item.id), JSON.stringify(item)]));
    const components = new Map((value?.components || []).filter((item) => item?.id).map((item) => [String(item.id), JSON.stringify(item)]));
    for (const id of [...tokenMap.keys()]) if (!tokens.has(id)) tokenMap.delete(id);
    for (const id of [...componentMap.keys()]) if (!components.has(id)) componentMap.delete(id);
    for (const [id, encoded] of tokens) if (tokenMap.get(id) !== encoded) tokenMap.set(id, encoded);
    for (const [id, encoded] of components) if (componentMap.get(id) !== encoded) componentMap.set(id, encoded);
  }, origin);
}

export function writeSceneToYDoc(doc, scene = {}, origin = LOCAL_SERVER_ORIGIN) {
  const maps = getMaps(doc);
  const nextElements = Array.isArray(scene.elements) ? scene.elements : [];
  const nextFiles = scene.files && typeof scene.files === "object" ? scene.files : {};
  const elementEntries = new Map(nextElements.filter((item) => item?.id).map((item) => [item.id, JSON.stringify(item)]));
  const fileEntries = new Map(Object.entries(nextFiles).map(([id, file]) => [id, JSON.stringify(file)]));

  doc.transact(() => {
    for (const key of Array.from(maps.elements.keys())) {
      if (!elementEntries.has(key)) maps.elements.delete(key);
    }
    for (const [key, value] of elementEntries) {
      if (maps.elements.get(key) !== value) maps.elements.set(key, value);
    }
    for (const key of Array.from(maps.files.keys())) {
      if (!fileEntries.has(key)) maps.files.delete(key);
    }
    for (const [key, value] of fileEntries) {
      if (maps.files.get(key) !== value) maps.files.set(key, value);
    }
    const appState = scene.appState && typeof scene.appState === "object" ? scene.appState : {};
    const safeAppState = {
      viewBackgroundColor: appState.viewBackgroundColor || "#ffffff",
      gridSize: appState.gridSize ?? null
    };
    const encodedAppState = JSON.stringify(safeAppState);
    if (maps.metadata.get("appState") !== encodedAppState) maps.metadata.set("appState", encodedAppState);
  }, origin);
  if (Array.isArray(scene.notes)) writeNotesToYDoc(doc, scene.notes, origin);
  const designStudio = {
    tokens: Array.isArray(scene.designStudio?.tokens) ? scene.designStudio.tokens.slice(0, 200) : [],
    components: Array.isArray(scene.designStudio?.components) ? scene.designStudio.components.slice(0, 200) : []
  };
  writeDesignStudioToYDoc(doc, designStudio, origin);
  // Scene writes are authoritative snapshots (initial seed or history restore),
  // unlike incremental client project patches. Reconcile missing items and
  // clear old tombstones for records explicitly present in the restored scene.
  writeProjectItemsToYDoc(doc, Array.isArray(scene.projectItems) ? scene.projectItems : [], origin, { replace: true });
}

export function readSceneFromYDoc(doc) {
  const maps = getMaps(doc);
  const elements = [];
  const files = {};

  for (const value of maps.elements.values()) {
    const element = safeParse(value, null);
    if (element) elements.push(element);
  }
  elements.sort((left, right) => {
    const a = String(left.index || "");
    const b = String(right.index || "");
    return a < b ? -1 : a > b ? 1 : 0;
  });

  for (const [id, value] of maps.files.entries()) {
    const file = safeParse(value, null);
    if (file) files[id] = file;
  }

  const notes = [];
  for (const [id, encoded] of maps.noteMetadata.entries()) {
    const metadata = safeParse(encoded, null);
    if (!metadata) continue;
    const content = maps.noteContent.get(id);
    notes.push({ ...metadata, id, content: content instanceof Y.Text ? content.toString() : "" });
  }
  notes.sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));

  const projectItems = [];
  for (const [id, encoded] of maps.projectItems.entries()) {
    const item = encoded instanceof Y.Map
      ? Object.fromEntries(encoded.entries())
      : safeParse(encoded, null);
    if (item) projectItems.push({ ...item, id });
  }
  projectItems.sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));

  const readDiscussion = (map) => [...map.entries()].map(([id, encoded]) => {
    const item = encoded instanceof Y.Map ? Object.fromEntries(encoded.entries()) : safeParse(encoded, null);
    return item && !item.deletedAt ? { ...item, id } : null;
  }).filter(Boolean).sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

  return {
    elements,
    appState: safeParse(maps.metadata.get("appState"), { viewBackgroundColor: "#ffffff" }),
    files,
    notes,
    projectItems,
    designStudio: readDesignStudio(maps),
    messages: readDiscussion(maps.messages),
    comments: readDiscussion(maps.comments)
  };
}

export function createYDocFromScene(scene) {
  const doc = new Y.Doc();
  writeSceneToYDoc(doc, scene);
  return doc;
}

export function getSceneMaps(doc) {
  return getMaps(doc);
}

export { Y };
