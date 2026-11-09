# Arcdraw sharing, live collaboration and checkpoints

This milestone adds cloud-backed room sharing, live collaboration and Git-inspired named checkpoints.

## Architecture

- Excalidraw remains the canvas editor. Arcdraw owns persistence, permissions and the workspace experience.
- Dexie/IndexedDB keeps a device-local copy of each room and a per-account Yjs replica.
- Yjs stores each Excalidraw element by its stable element ID, file records by file ID, and small scene metadata in a Y.Doc. The client diffs element versions and only publishes records that changed locally, rather than rewriting every object from a potentially stale canvas snapshot.
- Socket.IO authenticates with the HTTP-only access cookie, joins an authorized room, relays Yjs updates and sends ephemeral pointer/presence events.
- MongoDB stores room metadata, a binary Yjs snapshot, share-link metadata and named commit snapshots.
- Share-link tokens are random bearer secrets. Only a SHA-256 hash is stored in MongoDB. The raw token is sent in POST bodies / Socket.IO payloads rather than a server request URL.

## Start the applications

Install each project independently. There is intentionally no root npm workspace.

### Backend

```powershell
cd backend
Copy-Item .env.example .env
# Edit .env: set MONGODB_URI and generate JWT_ACCESS_SECRET / OTP_HASH_SECRET.
npm install
npm run dev
```

### Frontend

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

The API defaults to `http://localhost:5000`; the web client defaults to `http://localhost:5173`.

## Test live collaboration with two users

1. Run MongoDB, the backend and the frontend.
2. Open Arcdraw in browser profile A and sign in.
3. Create a local room and open it.
4. Select **Share**. This first saves the room to the cloud, then creates an invite link.
5. Choose **Can edit** and copy the link.
6. Open the link in browser profile B (or a second browser). Sign in with a different Arcdraw account.
7. Both users should see a Live status and participant avatars. Draw a new shape on A; it should appear on B. Move the pointer to see the remote cursor.
8. Draw on B; the update should appear on A.
9. In profile A, choose **Commit**, enter a message and save a checkpoint. Open **History** to see its short hash, sequence, parent checkpoint, author and timestamp.
10. Restore a checkpoint to create a new restore checkpoint without deleting later history.
11. Try a viewer link: that account can inspect the room and receive live updates but cannot edit, commit or create share links.
12. Revoke a link from the Share dialog. Connected sockets using that link are removed from the room and notified.

Use different accounts to test permissions. Opening two tabs in the same signed-in account is useful for visual sync tests but does not test account-to-account authorization independently.

## API routes

All cloud room routes require an account session. The HTTP resource path retains the internal `/boards` name for compatibility; the product calls these resources Rooms.

- `POST /api/v1/boards` — create or retrieve a cloud room from a local room ID and initial scene.
- `GET /api/v1/boards/:boardId` — read a cloud room scene.
- `PATCH /api/v1/boards/:boardId` — rename a room.
- `POST /api/v1/boards/:boardId/shares` — create a viewer/editor link.
- `GET /api/v1/boards/:boardId/shares` — list active links.
- `DELETE /api/v1/boards/:boardId/shares/:shareId` — revoke a link.
- `POST /api/v1/shares/resolve` — resolve a share token after sign-in.
- `GET /api/v1/boards/:boardId/commits` — list named checkpoints.
- `POST /api/v1/boards/:boardId/commits` — create a named checkpoint.
- `POST /api/v1/boards/:boardId/commits/:commitId/restore` — restore a checkpoint as a new version.

Socket.IO events:

- Client → server: `board:join`, `board:update`, `board:sync`, `board:presence`.
- Server → client: `board:update`, `board:presence:join`, `board:presence:leave`, `board:presence:pointer`, `board:access:revoked`.

## How checkpoint history works

A checkpoint stores a complete encoded Yjs document snapshot plus message, author, timestamp, sequence number, short hash, parent checkpoint reference and a simple added/changed/removed element summary. This is Git-inspired version history, **not a Git repository**: there are no branches, rebases, file diffs or Git remotes. Restoring an older checkpoint updates the live Y.Doc and creates a new restore checkpoint, preserving the existing history.

## Concurrency model and limitations

- Distinct Excalidraw element IDs merge independently in Yjs.
- Concurrent updates to different element IDs can merge independently because only changed element records are published. Concurrent updates to the same element are represented as one Y.Map value (serialized element JSON); Yjs chooses one deterministic winner for that key. It does not merge individual element properties independently. The same applies to scene-level background/grid metadata.
- Deletions are propagated using IDs known to the local scene; concurrent edits to the same element and delete-vs-edit races can still need a later, more granular operation model.
- Pointer presence is ephemeral and is not stored in MongoDB.
- Local work is saved to IndexedDB and can be edited offline. Cloud collaboration requires an internet connection to the deployed API. When a previously connected cloud room reconnects, its local Yjs replica sends its merged update. LAN-only multiplayer without internet is not implemented in this milestone.
- The server keeps active Y.Doc rooms in process memory and periodically persists snapshots to MongoDB. Run one backend instance for this version; horizontally scaled deployment requires a shared Socket.IO adapter and coordinated document persistence. Checkpoint sequence locking is in-process, so multi-instance deployments also require a distributed lock or transaction strategy.
- File/image payloads are currently included in the Yjs document snapshot. Large assets can exceed the current 7 MB snapshot/update guard; a dedicated object-storage asset pipeline is a future improvement.
- Cloud room documents and snapshots are bounded by application size limits; the server rejects a resulting snapshot that would exceed the 7 MB cap. This is a development milestone and still needs load/security testing before production use.

## Suggested two-person smoke test

- Use two separate browser profiles and two different Arcdraw accounts.
- In profile A, create a room, draw two separate shapes, then create an editor link.
- In profile B, open the link, authenticate and wait for the Live indicator.
- Move both pointers and confirm name-labelled cursors and participant badges appear.
- Have A move shape 1 while B moves shape 2 at roughly the same time. Both final positions should appear on both screens. This specifically exercises element-level diff publishing.
- Have both users change the same shape simultaneously. One complete element version will win deterministically; individual properties are not yet merged independently.
- Create a named commit and inspect its parent hash and change summary. Restore an earlier checkpoint and confirm a new restore checkpoint appears.
- Create a viewer link and confirm it receives live updates but cannot modify the room. Revoke an active link and verify the connected viewer/editor socket is removed.

A local browser can still open its own rooms without internet. Live collaboration between different devices currently uses the cloud Socket.IO endpoint and therefore requires network access; LAN-only rooms are not part of this milestone.


## Notes workspace synchronization

Room notes share the room's cloud Y.Doc. Note metadata is held in `arcdraw.notes.metadata.v1`; each note body is a Y.Text in `arcdraw.notes.content.v1`. Body edits are published as Y.Text operations on input, rather than replacing a whole note snapshot. IndexedDB/Dexie stores the local note replica and is updated from remote Yjs changes. Creating, renaming, linking and deleting notes updates metadata; a newly created note seeds its Y.Text once. Existing Y.Text content must not be replaced by a stale local metadata refresh.

A named checkpoint captures the whole Y.Doc, including canvas elements, files and notes. Restoring a checkpoint therefore restores the notes content and metadata alongside the drawing. The current Notes Studio editor is Markdown-based (write/preview), not a full block editor or a TipTap/ProseMirror CRDT editor. Cursor-preserving remote updates are best-effort; collaborative remote edits can still reposition a selection when changes overlap.

### Notes collaboration smoke test

- With two editor accounts in the same room, open the same Notes room in both browsers.
- Create a note in one browser and confirm it appears in the other.
- Type in the note and confirm the other browser receives updates while typing.
- Try simultaneous edits in different parts of a note. Y.Text merges the operations, but review the final text when both users edit overlapping ranges.
- Rename, link and delete a note and confirm metadata changes propagate.
- Create a checkpoint, change a note, then restore the checkpoint and confirm the note body is restored.
- Disconnect one client, edit a note locally, reconnect and confirm its Yjs replica is synced and the server-acknowledged snapshot is stored in MongoDB.

## Sync status contract

Arcdraw distinguishes local durability from cloud durability:

- **Saved on device** means the scene/note write completed in Dexie/IndexedDB. It does not imply a server copy exists.
- **Syncing** means the local Y.Doc has changes being sent or acknowledged.
- **Synced** is shown after the server acknowledges a full Yjs update. The server's acknowledgement is sent only after the MongoDB snapshot write completes.
- **Offline · queued** means edits remain in the local Yjs replica/IndexedDB and will be included in the next full-state sync after reconnecting.
- **Sync issue** means the last attempted server write failed. The client retains local data and retries a full-state sync while connected.

The room's canvas scene (for Board rooms), Notes workspace data (for Notes rooms) and project tasks/milestones share one Y.Doc. Canvas elements are keyed by Excalidraw element ID; note metadata is in a Y.Map and note bodies are Y.Text instances; project records are nested Y.Maps with field-level updates and deletion tombstones. Notes body input is published as text operations as the user types, while Dexie keeps a debounced durable local copy. Before opening the Project panel in a Notes room, navigating away, creating a share or checkpoint, the editor flushes the open note draft and then requests a server-acknowledged full sync when connected.

These guarantees still depend on browser storage being available and not being cleared by the user/browser. For stronger production durability, add quota monitoring, explicit backup/export prompts, server-side asset storage and operational monitoring.

## Room project data

Rooms also sync tasks and milestones in the same Yjs document. See [`project-management.md`](project-management.md) for the data model, offline conflict handling, linking behavior and manual test matrix.
