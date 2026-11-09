# Arcdraw MEGA roadmap status

Desktop/Tauri is intentionally deferred. This document separates working v1 capabilities from partial foundations and future design-engine work.

| Milestone | Included now | Current boundary |
|---|---|---|
| 1. Workspace + Local Board Engine | Guest workspace, Boards library, create/rename/duplicate/delete, Excalidraw, Dexie/IndexedDB autosave, import/export | Local library organization is device-local |
| 2. Notes System | Dedicated Notes rooms, multiple notes, Markdown write/preview, search, local autosave, linked notes and task references | Markdown editor, not a block editor or TipTap/ProseMirror |
| 3. Cloud Workspace | Existing auth, save-to-cloud, bulk local-to-cloud migration, room sharing, cloud snapshots, checkpoint history | No org-level team directory or persistent cloud folder tree yet |
| 4. Real-time Collaboration | Yjs room document, shared canvas, collaborative note Y.Text, presence, cursors, offline local replica, LAN-host deployment guide | LAN is host/server-mediated; not peer-to-peer WebRTC. Same-element canvas edits are not property-level CRDT merges |
| 5. Project Management | Room tasks, milestones, assignees from active participants, due dates, links to Board elements or Notes, list and Kanban views, local room folders | No comments, notifications, workload views or persistent team directory |
| 6. Advanced Design Studio | Flat layers with hide/lock/order, frame presets, reusable component snapshots and variants, room color tokens, geometric auto layout, presentation mode | Frames are rectangles, variants are snapshots, and auto layout is not responsive constraints. No prototype interaction engine |
| 7. Desktop + Production | Production docs, backup and LAN setup guidance | Tauri/Desktop remains excluded. Cross-device, scale, storage quota and operational testing remain to be completed |

## Agent decision

Arcdraw Agent addresses a concrete workflow gap: users can capture ideas in a canvas or notes, but converting those ideas into researched, prioritized work requires manually switching tools. Agent inspects bounded room context, optionally searches Tavily, returns gaps and a recommended approach, and proposes tasks. Users approve the tasks before they enter Project. It does not silently modify rooms and does not run a general autonomous tool loop. See [`agent.md`](agent.md).

## Recommended next development order

1. Production verification: complete `npm install`, frontend production build, two-account/two-browser sync tests and backup/restore tests.
2. Cloud workspace completeness: persistent room membership, team directory, cloud-synced folder hierarchy and storage quota/asset backup handling.
3. Design engine: native frame/constraint model, nested groups/layers, component overrides and interactions/prototyping.
4. Operational hardening: multi-instance Socket.IO adapter, monitoring, upload limits, backup automation and recovery drills.
5. Only then scope desktop/Tauri.
