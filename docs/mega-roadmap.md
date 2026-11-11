# Arcdraw MEGA roadmap status

Desktop/Tauri is intentionally deferred. This document separates working v1 capabilities from partial foundations and future design-engine work.

| Milestone | Included now | Current boundary |
|---|---|---|
| 1. Workspace + Local Board Engine | Guest workspace, Boards library, create/rename/duplicate/delete, Excalidraw, Dexie/IndexedDB autosave, import/export | Local library organization is device-local |
| 2. Notes System | Dedicated Notes rooms, multiple notes, Markdown write/preview, search, local autosave, linked notes and task references | Markdown editor, not a block editor or TipTap/ProseMirror |
| 3. Cloud Workspace | Existing auth, save-to-cloud, bulk local-to-cloud migration, room sharing, cloud snapshots, checkpoint history | No org-level team directory or persistent cloud folder tree yet |
| 4. Real-time Collaboration | Yjs room document, shared canvas, collaborative note Y.Text, presence, cursors, room chat, canvas-anchored comments, threaded replies, resolve/reopen, offline local replica | LAN is host/server-mediated; not peer-to-peer WebRTC. Same-element canvas edits are not property-level CRDT merges. No @mention or notification delivery |
| 5. Project Management | Room tasks, subtasks, dependency links, milestones, assignees from active participants, due dates, links to Board elements or Notes, list and Kanban views, local room folders | No task comments, notifications, workload views or persistent team directory |
| 6. Advanced Design Studio | Flat layers, group/ungroup, hide/lock/order, frame presets, linked component masters/instances, text/fill/visibility properties, editable variant instances, room color tokens, geometric auto layout, presentation mode | Still Excalidraw-backed; no responsive constraints, native vector-frame model, cross-room libraries or full interactive prototype engine |
| 7. Web Production | PWA shell, account session rotation, cloud collaboration, setup/test guides | Web build and live multi-browser tests remain unverified in this workspace; backup recovery, scaling and storage quota need work. Tauri/Desktop is explicitly deferred |

## Agent decision

ArcDraw Design Agent turns a visual brief into a validated, editable canvas composition using LangGraph.js and Groq. Users preview the layout and approve before native objects are applied to the room. See [`agent.md`](agent.md).

## Recommended next development order

1. Production verification: complete `npm install`, frontend production build, two-account/two-browser sync tests and backup/restore tests.
2. Web reliability: run clean npm installs/builds, browser test suites, sync conflict tests and restore/backup drills.
3. Cloud workspace completeness: persistent room membership, team directory, cloud-synced folder hierarchy and object-storage asset pipeline.
4. Design engine: native frame/constraint model, hierarchical layers, cross-room libraries, responsive layout and interactions/prototyping.
5. Operational hardening: multi-instance Socket.IO adapter, monitoring, upload limits, backup automation and recovery drills.
6. Only then scope desktop/Tauri.
