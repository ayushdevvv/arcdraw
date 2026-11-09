# Arcdraw Phase 1 — Local Board Workspace

## Scope

Phase 1 delivers a guest-first, local-only board library and Excalidraw-powered drawing experience. It deliberately does not include rich notes, cloud document sync, LAN collaboration, project management, or a Figma-grade component system.

## Data ownership

- A browser-local guest ID is created in `localStorage`.
- Boards are stored in IndexedDB through Dexie.
- Every board row includes its `guestId`; all board queries require that ID.
- MongoDB is not involved in guest board CRUD.
- Guest cloud-save/share/collaboration requests trigger the existing account gate.

## Board document shape

```js
{
  id: "uuid",
  guestId: "browser-local-guest-id",
  title: "System map",
  elements: [],
  appState: {},
  files: {},
  starred: false,
  createdAt: "ISO date",
  updatedAt: "ISO date"
}
```

`appState` is allow-listed before it is persisted. Transient editor state such as selections, open dialogs, collaborators, and active tools is not required for restoring a board.

## Save behaviour

1. Excalidraw emits `onChange(elements, appState, files)`.
2. The latest scene is held in memory and debounced for 450 ms.
3. Dexie writes the scene to IndexedDB.
4. The editor reports `Saved on device` after the IndexedDB write completes.
5. On component unmount, a pending scene is flushed to IndexedDB.

This is local persistence, not cloud sync. IndexedDB is the source of truth for guest boards in Phase 1.

## Offline shell

The Vite PWA plugin generates the service worker during production builds. It precaches the compiled app shell and local static assets. Excalidraw fonts are copied from the installed package to `frontend/public/fonts` before dev/build and are self-hosted; the frontend does not load Google Fonts from a CDN.

A first visit still needs a connection to download the app. For an offline-reload test, build and preview the app, open it once, wait for service-worker installation, then switch the browser to Offline.

## Important limitations

- Guest boards are stored per browser profile and origin. Clearing site data or using a different browser profile will not show the same boards.
- Guest-to-account migration is not implemented yet.
- Board sharing, live collaboration, CRDT updates and cross-device sync are not implemented yet.
- `navigator.onLine` is only a browser network hint, not a reliable internet reachability test.
- Excalidraw is used for the first whiteboard experience. A separate custom design-engine effort will be needed for advanced reusable design components, variants, auto layout and prototyping.
