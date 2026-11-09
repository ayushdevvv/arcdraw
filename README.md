# Arcdraw

**Current milestone: Arcdraw MEGA preview (v0.10.0).**

Arcdraw is a local-first visual workspace in development: create a Board room for a dedicated shared canvas or a Notes room for a dedicated writing workspace, organize rooms into folders, plan work with Kanban/tasks/milestones, and use an optional research agent to turn goals into approved work. Boards and Notes open as separate full-workspace experiences, while both retain the same cloud sharing, live collaboration and Git-inspired checkpoints.

The repository contains two **independent npm projects**:

- `frontend/` — React JSX, Vite, Excalidraw, Dexie/IndexedDB, Yjs and Socket.IO client.
- `backend/` — Express, MongoDB/Mongoose, email OTP, Google/GitHub OAuth, Socket.IO and Yjs persistence.

There is deliberately **no root `package.json`, no root `node_modules` and no npm workspaces**. Install dependencies inside `frontend/` and `backend/` separately.

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

Build and preview the production PWA:

```powershell
npm run build
npm run preview
```

The service worker is configured for production builds. The development server is not the authoritative test for offline app-shell caching.

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

Google/GitHub OAuth and SMTP are optional for local development. Provider setup is in `docs/google-oauth.md` and `docs/github-oauth.md`.

## Current features

- Email/password auth, 8-digit email/password-reset OTP, Google OAuth and GitHub OAuth.
- HTTP-only access/refresh cookies with refresh-token rotation.
- Guest identity and local Rooms library in the browser, with separate **Boards** and **Notes** library filters and **Create board** / **Create notes** actions.
- Dedicated Board rooms with the Excalidraw canvas, local Dexie/IndexedDB autosave, import and export.
- Dedicated Notes rooms with a full-width Markdown writing workspace, note library, search and preview. Notes are not shown beside the canvas.
- Production PWA shell caching for reopening the app offline after it has been loaded once.
- Account-backed cloud Rooms.
- Share links with viewer/editor permission and expiry/revocation.
- Live multi-user scene synchronization using Yjs over Socket.IO. Board rooms and notes rooms use the same room identity, permissions, presence and sync path.
- Room Project panel in both room types with tasks, milestones, status, priority, due dates and live-room assignees. Board tasks link directly to canvas elements; Notes tasks link directly to notes. Project data is cached in IndexedDB, persisted in the room Yjs document and included in editable exports/checkpoints.
- Live participant presence and remote pointer cursors.
- Git-inspired named checkpoint history with parent links, restore checkpoints and scene, notes + project change summaries.
- Dedicated Notes rooms use the same local autosave, sharing, presence and Yjs collaborative text system as Board rooms.
- Notes drafts flush before opening Project or leaving a room; save indicators stay pending until the latest draft is persisted locally.
- Persistent light and dark themes across the home page, Rooms library, Board canvas and Notes workspace, with Manrope interface typography and DM Mono metadata.
- Room library folders, room movement, and a bulk local-to-cloud migration action that keeps local copies intact. Folder metadata is currently local to each browser.
- Project Kanban with drag-and-drop status changes, plus a list view, task/milestone links, and room-level assignments.
- Board Design Studio with flat layer ordering/hide/lock, frame presets, reusable component snapshots and variants, color tokens, geometric auto layout and presentation mode. See [`docs/design-studio.md`](docs/design-studio.md) for what is deliberately not a native Figma-grade design engine yet.
- Arcdraw Agent: room-aware goal analysis, optional Tavily web research, gap analysis, recommended approach and proposed tasks. If Tavily is unavailable, analysis falls back to a clearly labelled AI-only plan. Only explicitly approved tasks are written into Project. Provider keys stay on the server.
- Same-Wi-Fi LAN-hosted collaboration setup using the existing Express + Socket.IO service. See [`docs/lan-collaboration.md`](docs/lan-collaboration.md).

## Collaboration setup and testing

Read [`docs/collaboration.md`](docs/collaboration.md) for architecture, API routes, a two-account/two-browser test and known limitations. Read [`docs/project-management.md`](docs/project-management.md), [`docs/design-studio.md`](docs/design-studio.md), [`docs/agent.md`](docs/agent.md), and [`docs/mega-roadmap.md`](docs/mega-roadmap.md) for the updated MEGA scope and feature boundaries.

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
│   │   ├── offline/
│   │   ├── pages/
│   │   ├── realtime/
│   │   └── services/
│   ├── .env.example
│   └── package.json
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
- Same-element concurrent canvas edits are whole-element last-writer-wins, not property-level merges.
- Folder organization is currently local to a browser; it is not a cloud team folder hierarchy.
- Agent calls send the prompt and bounded room excerpts to the configured AI provider. Tavily receives only the search query. Review third-party provider data terms before sending confidential room content.
- The current release is a development preview. Full production build, multi-user conflict testing, cloud folder membership, asset backup recovery and multi-instance Socket.IO scaling still need verification.

## Working modes (room owner decides)

Open a cloud room, then use the mode chip at the top right or the room menu, "How this room works".

- **Live editing**: everyone with edit access changes the room at the same time.
- **Commit and review**: only the owner changes the room directly. Editors work on a private draft that stays on their device, then use Submit for review. The owner opens Review requests, previews before and after, and merges or declines. Merged requests appear in History as Merged.

If the owner switches back to live editing, editors who still hold an unsent draft choose to send it or discard it.

## Going to production

1. Backend on Render: use `backend/render.yaml`. Set MONGODB_URI, JWT_ACCESS_SECRET (32+ characters), CLIENT_URL, CORS_ORIGINS and API_PUBLIC_URL to your deployed addresses. The server refuses to start in production with localhost addresses or without COOKIE_SECURE.
2. Frontend on Vercel: set `VITE_API_BASE_URL` to `https://your-api.onrender.com/api/v1`. `frontend/vercel.json` adds security headers and caching.
3. Rooms sync up to about 7 MB. The editor warns before that limit is reached.
