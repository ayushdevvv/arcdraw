# Arcdraw architecture notes

## Current boundaries

- `controllers/` are HTTP adapters: parse validated input, call services, set cookies and write responses.
- `services/` contain application workflows and do not depend on Express request/response objects.
- `models/` define MongoDB persistence schemas only.
- `config/` owns environment and infrastructure clients.
- `middlewares/` own request-level concerns such as authentication, origin validation, rate limiting and errors.
- `validators/` define external input contracts.
- `utils/` contain small shared primitives such as OTP generation, keyed hashing and cookie handling.
- The browser guest identity is intentionally separate from an Arcdraw account and never becomes an API authentication credential.

## Authentication providers

Email/password, Google and GitHub sign-in resolve to a common MongoDB User document. A verified email from Google or GitHub can be linked to an existing account with the same normalized email. GitHub requests only `read:user` and `user:email` and does not request repository access.

## Email OTP lifecycle

1. Registration creates an unverified account and sends an 8-digit OTP.
2. The OTP is generated with a cryptographically secure random generator and hashed using HMAC-SHA256 with `OTP_HASH_SECRET` (or the JWT secret fallback).
3. The OTP expires after 10 minutes, is single-use, allows five incorrect attempts, and has a 60-second resend cooldown.
4. Successful verification marks the account as verified and clears all OTP fields.
5. Password reset uses the same OTP policy and revokes all existing sessions after a successful password change.

## Session lifecycle

1. Password sign-in or Google/GitHub OAuth resolves a verified user.
2. API creates a short-lived JWT access token and a random opaque refresh token.
3. Access token is placed in an HTTP-only cookie scoped to `/`.
4. Refresh token is placed in an HTTP-only cookie scoped to `/api/v1/auth`.
5. Only a SHA-256 hash of the refresh token is stored in MongoDB.
6. Refresh requests atomically revoke the old session and create a replacement session.
7. Reuse of a revoked refresh token revokes the user's active refresh sessions.

## Guest and account-backed actions

Guests can edit local content without a server account. Guest session identity is stored in browser localStorage; it is not an auth token and does not auto-expire while local boards remain in IndexedDB. Local web boards use Dexie/IndexedDB. The desktop app will later use a local database adapter.

Cloud save, sharing, invitations and live collaboration are account-backed operations. The frontend helper `requireAccountForAction` dispatches an event for the app shell to open sign-in UI. Every corresponding backend route must use `requireAccount` (alias of `requireAuth`). Client-side gating alone is never authorization.

## Future workspace sync boundary

Do not store the entire live canvas or Yjs document in a single MongoDB workspace document. Keep account, workspace/project metadata and ACLs in ordinary Mongoose models. Persist collaborative document updates and compacted snapshots as separate records or binary objects, indexed by workspace/document ID. Browser clients must persist working state locally before attempting network sync. A signed-in guest's local drafts should be migrated through a conflict-aware import flow rather than overwritten.


## Phase 1 browser workspace

- `frontend/src/database/db.js` defines the Dexie IndexedDB store.
- `frontend/src/database/boardService.js` owns guest-scoped board CRUD, import, duplication and export payloads.
- `frontend/src/database/useBoards.js` uses Dexie `liveQuery` to keep the board library reactive.
- `frontend/src/features/rooms/RoomEditor.jsx` embeds Excalidraw and debounces scene persistence to IndexedDB.
- `frontend/src/offline/` handles browser connectivity state and service-worker registration.
- The PWA build precaches the app shell; Excalidraw fonts are copied into the local public assets before development/build.

This stage is local-only. Do not add cloud writes to the canvas until the future sync engine has a durable operation/update format and conflict policy.


## Room Notes Studio

Each Notes room has a full-workspace Notes editor backed by the `notes` table in Dexie/IndexedDB. Board rooms open directly into the canvas and do not render the Notes editor beside it. Notes are scoped by `guestId` and `roomId`; a note can reference an Excalidraw element ID with `linkedElementId`. The note body is Markdown text in this milestone. Local changes are persisted through `noteService.js`; cloud room bodies are represented by Yjs `Y.Text` values so concurrent text operations can merge. Note metadata (title, timestamps and linked element) is stored separately in a Y.Map.

The client publishes note-body edits directly to Yjs as the user types, while Dexie remains the local durable replica. Metadata and note creation/deletion are reconciled from the reactive Dexie notes collection. A client must not overwrite an existing Y.Text from a possibly stale Dexie snapshot; existing Y.Text content is authoritative once it has been seeded.
