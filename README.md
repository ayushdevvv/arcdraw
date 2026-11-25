# Arcdraw

**Current milestone: ArcDraw web workspace v0.15.4 with Electron desktop v0.15.5.**

Arcdraw is a local-first visual workspace in development: create a Board room for a dedicated shared canvas or a Notes room for a dedicated writing workspace, organize rooms into folders, plan work with Kanban/tasks/milestones, and use the LangGraph-powered Design Agent to turn prompts into editable canvas compositions. Boards and Notes open as separate full-workspace experiences, while both retain the same cloud sharing, live collaboration and Git-inspired checkpoints.

The repository contains three **independent app packages**:

- `frontend/` — React JSX, Vite, Excalidraw, Dexie/IndexedDB, Yjs and Socket.IO client. This is shared by the web and desktop builds.
- `backend/` — Express, MongoDB/Mongoose, email OTP, Google/GitHub OAuth, Socket.IO and Yjs persistence.
- `desktop/` — Electron 45 desktop shell, secure local API bridge, OS-encrypted account session, Windows installer and auto-update configuration.

There is deliberately **no root `package.json`, no root `node_modules` and no npm workspaces**. Install dependencies inside each package separately.

## Requirements

- Node.js 22.12+ (Node 24 LTS recommended for the current Vite toolchain).
- npm 10+.
- MongoDB local or Atlas for authentication, cloud boards and collaboration.

## Frontend setup

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`.

Build and preview the production app:

```powershell
npm run build
npm run preview
```

## Backend setup

```powershell
cd backend
Copy-Item .env.example .env
```

Edit `backend/.env`:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/arcdraw
JWT_ACCESS_SECRET=replace-with-random-secret-at-least-32-characters
OTP_HASH_SECRET=replace-with-a-different-random-secret-at-least-32-characters
CLIENT_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
API_PUBLIC_URL=http://localhost:5000
```

Generate each secret independently:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Then:

```powershell
npm install
npm run dev
```

API health check: `http://localhost:5000/api/v1/health`.

Google/GitHub OAuth and Brevo email delivery are optional for local development. Provider setup is in `docs/google-oauth.md`, `docs/github-oauth.md`, and `docs/brevo-email.md`.

## Current features

- Email/password auth, 8-digit email/password-reset OTP, Google OAuth and GitHub OAuth.
- HTTP-only access/refresh cookies with refresh-token rotation.
- Guest identity and local Rooms library in the browser, with separate **Boards** and **Notes** library filters and **Create board** / **Create notes** actions.
- Dedicated Board rooms with the Excalidraw canvas, local Dexie/IndexedDB autosave, import and export. The board toolbar includes image upload, drag-and-drop, clipboard paste and editable sticky-note groups.
- Dedicated Notes rooms with a full-width Markdown writing workspace, note library, search and preview. Notes are not shown beside the canvas.
- Account-backed cloud Rooms.
- Share links with viewer/editor permission and expiry/revocation.
- Live multi-user scene synchronization using Yjs over Socket.IO. Board rooms and notes rooms use the same room identity, permissions, presence and sync path.
- Room Project panel in both room types with tasks, milestones, status, priority, due dates and live-room assignees. Board tasks link directly to canvas elements; Notes tasks link directly to notes. Project data is cached in IndexedDB, persisted in the room Yjs document and included in editable exports/checkpoints.
- Live participant presence and remote pointer cursors.
- Room Discussion panel with persistent Yjs chat messages, canvas-anchored comments, threaded replies, resolve/reopen controls and jump-to-object navigation. Discussion is shared by authenticated cloud-room collaborators.
- Board image insertion through a dedicated file picker, drag-and-drop and image paste. Images are downsampled/compressed before being stored in Excalidraw's file cache, local room record and cloud Yjs document. Notes can also attach images and render them from room assets.
- Design Studio component masters, inserted instances, per-instance text/color/visibility properties, captured variants with their own properties, and update-master propagation to default instances. Layer tools also support grouping/ungrouping selected objects.
- Git-inspired named checkpoint history with parent links, restore checkpoints and scene, notes + project change summaries.
- Dedicated Notes rooms use the same local autosave, sharing, presence and Yjs collaborative text system as Board rooms.
- Notes drafts flush before opening Project or leaving a room; save indicators stay pending until the latest draft is persisted locally.
- Persistent light and dark themes across the home page, Rooms library, Board canvas and Notes workspace, with Manrope interface typography and DM Mono metadata.
- Room library folders, room movement, and a bulk local-to-cloud migration action that keeps local copies intact. Folder metadata is currently local to each browser.
- Project Kanban with drag-and-drop status changes, a list view, task/milestone links, subtasks, dependency relationships with cycle-prevention in the editor, and room-level assignments.
- Board Design Studio with layers, grouping/ungrouping, frame presets, reusable component masters/instances, basic properties and variants, room color tokens, geometric auto layout and presentation mode. This remains an Excalidraw-backed design toolkit, not a complete native Figma replacement. See [`docs/design-studio.md`](docs/design-studio.md).
- ArcDraw Design Agent: LangGraph-powered natural-language-to-canvas generation using Groq `openai/gpt-oss-120b`. It creates a validated preview made from editable native canvas objects; users approve before applying it. Progress is streamed to the panel, and the resulting scene uses the existing local-save and Yjs sync flow. Provider keys stay on the server.
- Same-Wi-Fi LAN-hosted collaboration setup using the existing Express + Socket.IO service. See [`docs/lan-collaboration.md`](docs/lan-collaboration.md).

## Collaboration setup and testing

Read [`docs/collaboration.md`](docs/collaboration.md) for architecture, chat/comments behavior, API routes, a two-account/two-browser test and known limitations. Use [`docs/web-stability-checklist.md`](docs/web-stability-checklist.md) for the recommended release test sequence. Read [`docs/project-management.md`](docs/project-management.md), [`docs/design-studio.md`](docs/design-studio.md), [`docs/agent.md`](docs/agent.md), and [`docs/mega-roadmap.md`](docs/mega-roadmap.md) for the updated MEGA scope and feature boundaries.

## Project structure

```text
arcdraw/
├── frontend/                 # Independent React/Vite project
│   ├── public/
│   ├── scripts/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── context/
│   │   ├── database/
│   │   ├── features/
│   │   ├── guest/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── realtime/
│   │   └── services/
│   ├── .env.example
│   └── package.json
├── desktop/                 # Electron desktop app and Windows release tooling
│   ├── src/                  # Main process and preload bridge
│   ├── assets/               # Windows application icon
│   └── scripts/              # Windows build helper
├── .github/workflows/        # Tagged Windows installer release workflow
├── backend/                 # Independent Express/MongoDB project
│   ├── src/
│   │   ├── config/
│   │   ├── constants/
│   │   ├── controllers/
│   │   ├── middlewares/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── sockets/
│   │   ├── utils/
│   │   └── validators/
│   ├── .env.example
│   └── package.json
└── docs/
```

## Security and deployment notes

- Never commit `backend/.env` or put server secrets in `frontend/.env`.
- Share URLs are bearer invitations; anyone with a valid link can use its permission after signing in. Revoke links when no longer needed.
- Cloud collaboration requires HTTPS in production so HTTP-only secure cookies can be used.
- This version keeps active Yjs rooms in one server process. Multi-instance deployments need a shared Socket.IO adapter and coordinated persistence.
- Same-element concurrent canvas edits are whole-element last-writer-wins, not property-level merges. Component master records are updated per component; independent component records/tokens no longer share one global serialized blob.
- Folder organization is currently local to a browser; it is not a cloud team folder hierarchy.
- Design Agent calls send the prompt and up to 12 selected object summaries to the configured Groq-compatible AI provider. The provider key remains server-side. Review third-party provider data terms before sending confidential room content.
- The web app remains available at the normal Vercel URL. The Electron desktop app bundles the same React renderer and serves it from a stable local origin so IndexedDB, Dexie and Yjs data survive restarts and remain available offline after a room has been downloaded once.
- Desktop REST traffic is proxied through the Electron main process to the Vercel API origin. The main process stores access/refresh credentials with Electron `safeStorage`; tokens are not exposed to renderer storage. Google and GitHub sign-in use the system browser and a one-time desktop handoff code.
- The desktop account workspace first caches the cloud room index. Each room's complete scene is downloaded when first opened, not in bulk during sign-in. After that download, canvas edits, notes and project items persist locally. Yjs full-state sync is retried after reconnection. Presence, messaging, invitations, commits, the Design Agent and other server-dependent features still require a network connection.
- Browser-only guest rooms on another device are not automatically copied into desktop. Sync them to the cloud from the web workspace first, then sign in to desktop.
- Windows desktop releases are built by `.github/workflows/release-desktop.yml`. See `desktop/README.md` for local builds, the Windows installer, publishing a tagged GitHub release and offline behaviour. The first Windows installer is not Authenticode-signed; Windows may show an unknown-publisher warning.
- Production builds and live desktop/device tests must still run in an environment with npm registry access. Multi-user conflict testing, asset backup recovery and multi-instance Socket.IO scaling remain release concerns.

## Working modes (room owner decides)

Open a cloud room, then use the mode chip at the top right or the room menu, "How this room works".

- **Live editing**: everyone with edit access changes the room at the same time.
- **Commit and review**: only the owner changes the room directly. Editors work on a private draft that stays on their device, then use Submit for review. The owner opens Review requests, previews before and after, and merges or declines. Merged requests appear in History as Merged.

If the owner switches back to live editing, editors who still hold an unsent draft choose to send it or discard it.

## Going to production

1. Backend on Render: use `backend/render.yaml`. Set MONGODB_URI, JWT_ACCESS_SECRET (32+ characters), CLIENT_URL, CORS_ORIGINS and API_PUBLIC_URL to your deployed addresses. `CLIENT_URL` and `CORS_ORIGINS` must include the exact Vercel app origin. The server refuses to start in production with localhost addresses or without COOKIE_SECURE.
2. Frontend on Vercel: `frontend/vercel.json` proxies `/api/v1/*` to `https://arcdraw.onrender.com`, keeping account cookies first-party on the app domain for mobile Chrome. Production builds use this same-origin route automatically; remove any old `VITE_API_BASE_URL` override from Vercel. Set `VITE_SOCKET_URL=https://arcdraw.onrender.com` only if your backend uses a different host (the default is already configured).
3. Rooms sync up to about 7 MB. The editor warns before that limit is reached. Large image assets are currently embedded in room snapshots; use modest images until object storage and backup recovery are implemented.


### Mobile browser authentication and OAuth callbacks

Production REST calls are routed through the frontend origin so Chrome does not need third-party cookies for the Render API. For Google and GitHub OAuth, production callback URLs resolve to `CLIENT_URL` and pass through the same Vercel `/api/v1` rewrite. Add `https://<your-vercel-domain>/api/v1/auth/google/callback` and `https://<your-vercel-domain>/api/v1/auth/github/callback` as the exact callback URLs in the provider applications. The OAuth handshake uses a unique short-lived HTTP-only cookie per attempt, so simultaneous tabs do not overwrite one another and OAuth does not need an additional MongoDB state write. Local development callbacks resolve to `API_PUBLIC_URL`. Email/password login uses the same-origin proxy automatically.
