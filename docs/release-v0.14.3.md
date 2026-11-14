# ArcDraw v0.14.3 release notes and readiness audit

## Collaboration and access

- Editor share links now open a read-only workspace preview for people who are not already members.
- The recipient uses **Join workspace** to submit a request. The API and Socket.IO deny editor access until the owner approves the request.
- Workspace owners can open **People** in the room's top bar to see the owner, all current members, online status and pending join requests, then approve or decline each request.
- Approval adds the account to the room's persistent member list. The recipient uses **Check access** to enter as an editor and begin live sync.
- Viewer links remain view-only and do not create join requests. Revoked and expired links remain invalid.
- Join-request uniqueness is indexed during database startup, including production deployments with Mongoose `autoIndex` disabled.

## Authentication changes

- Access JWTs no longer have a 15-minute expiry.
- MongoDB auth sessions no longer have a 30-day `expiresAt` value or TTL index.
- The refresh-token cookie, rotation endpoint and frontend refresh-on-401 flow are removed. The old refresh cookie is cleared at the next successful sign-in, and startup drops legacy `expiresAt_1` and `tokenHash_1` indexes.
- Expired legacy session records are marked revoked before the old TTL index is removed. A user holding an already-expired v0.14.2 access token must sign in once after deployment.
- The access credential remains in an HTTP-only, browser-managed cookie with no application-defined `Max-Age` or `Expires`. The browser controls how long a session cookie is retained.
- Explicit sign-out, sign-out-all and password reset revoke database sessions and disconnect their already-open collaboration sockets.
- OTP expiry, OAuth state-cookie expiry and optional share-link expiry are intentionally retained; they are separate security controls, not account-session timeouts.

## Readiness assessment

This release is a stronger collaborative-workspace MVP, not yet a production-certified Figma replacement.

The existing Design Agent is a LangGraph workflow with prepare, compose, review and one repair pass. It creates and refines editable canvas objects, but it is not a general-purpose autonomous multi-agent system with durable agent memory or a persistent tool-execution/checkpoint runtime.

The existing design surface remains Excalidraw-backed. Canvas same-element conflicts are whole-element last-writer-wins; room images are embedded in the Yjs document and subject to the documented room-size limit; live collaboration is single-server-process until a shared Socket.IO adapter and distributed persistence are deployed. Desktop/Tauri, cloud team folders, automatic backups and asset recovery remain out of scope or incomplete.

## Checks performed for this archive

- All backend JavaScript files pass `node --check`.
- All 56 frontend JavaScript/JSX files parse with the available TypeScript JSX parser.
- The collaboration stylesheet parses with PostCSS.
- A full Vite production build could not be run because frontend dependencies were not available in this environment (`vite: not found` after the dependency-install attempt timed out).
- MongoDB-backed API tests and a two-account browser/socket smoke test still need to be run against the deployment configuration before production release.
