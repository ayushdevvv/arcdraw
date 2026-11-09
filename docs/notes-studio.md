# Arcdraw Notes Workspace

Notes are scoped to a Room and stored locally in IndexedDB. They are included in editable Arcdraw exports, room duplication, share seeding and Yjs checkpoints.

## User features

- Multiple Markdown notes per Room.
- Search across note titles and body text.
- Write and rendered-preview modes.
- Formatting helpers for headings, bold, italic, lists, checklists, quotes and inline code.
- Word and character counts.
- Attach a note to the currently selected Excalidraw element.
- Viewer role is read-only.

## Local persistence

`frontend/src/database/db.js` defines the Dexie `notes` table. `noteService.js` owns create, list, update, delete, and remote-replica replacement operations. `useNotes.js` observes the table using Dexie's `liveQuery`; `useRoomNoteCounts.js` exposes per-Room counts to the Room library.

## Collaboration model

The Room's Y.Doc contains:

- `arcdraw.notes.metadata.v1`: Y.Map keyed by note ID, with title, timestamps and linked canvas element ID.
- `arcdraw.notes.content.v1`: Y.Map keyed by note ID, whose values are Y.Text instances.

Text input updates Y.Text immediately. Dexie persists the latest note draft after a short debounce; remote Yjs updates are materialized into the local Dexie note table. Title, timestamps, linked-element metadata and note deletion are Y.Map changes. The current editor is a Markdown textarea with safe rendered preview—not a TipTap/ProseMirror block editor. Remote cursor preservation is best-effort because the textarea is not bound to a collaborative editor CRDT binding.

## Checkpoints and portable files

A named checkpoint stores the full encoded Y.Doc, including canvas, assets and notes. A restore creates a new restore checkpoint rather than deleting history. `.excalidraw` JSON exports include a `notes` array; imports create new note IDs and attach them to the imported Room.

## Draft safety

The dedicated Notes workspace keeps the most recent draft in a ref while its debounce timer is pending. The editor flushes that draft before switching notes, creating a new note, deleting a note, opening the Project panel, navigating away, creating a share link or making a checkpoint. An older asynchronous save must not clear a newer pending draft or change its save indicator to “saved”.

## Testing checklist

1. Create a Room and add two notes.
2. Reload the browser and confirm both notes are present.
3. Format text and switch between Write and Preview.
4. Link a note to a selected canvas element.
5. Duplicate the Room and confirm the duplicate has independent copies of the notes.
6. Export the Room and import it; confirm notes and linked element IDs are preserved.
7. Sign in, save the Room to cloud, open it in a second account with an editor link, and confirm note creation, typing, rename and delete propagate.
8. Create a checkpoint, modify a note, restore the checkpoint and confirm the note is restored.
9. Disconnect one client, edit a note, reconnect and wait for the server-acknowledged sync state.
