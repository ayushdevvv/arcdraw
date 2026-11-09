# Room Projects

Each Arcdraw Room includes the same project layer, whether the room was created as a **Board** or **Notes** room. Room type changes the starting experience, not the collaboration model. Both types retain the same room ID, access permissions, presence, offline cache and cloud sync path.

## What is included

- **Tasks:** title, description, status, priority, due date and assignee.
- **Milestones:** named checkpoints with target dates and progress derived from linked tasks.
- **Assignments:** the room owner/current user and active collaborators currently present in the room are available in the assignment picker.
- **Board task links:** in a Board room, a task can point to a canvas element, including the currently selected element. Opening the link selects and scrolls to that element.
- **Notes task links:** in a Notes room, a task can point to a note in that room. Opening the link focuses that note in the Notes workspace.

## Local and cloud storage

Local project records are stored in the Dexie `projectItems` table and scoped by `guestId` and `roomId`. The IndexedDB v4 migration adds the table without replacing existing boards or notes. Project items are included when a room is duplicated, imported or exported as an editable `.excalidraw` JSON file. IDs are remapped on duplicate/import so note references and milestone-to-task references remain inside the new room.

For cloud rooms, each item is a nested `Y.Map` in `arcdraw.project.items.v1`. Fields are stored separately so two collaborators editing different fields of the same task do not replace each other's whole task record. Client mutations publish only changed fields; initial room creation seeds complete records. The server persists the Yjs update through the existing room document snapshot flow, so project data uses the same room access checks, Socket.IO channel, offline Yjs persistence and reconnect/full-sync behavior as the canvas and notes.

## Deletion and history

Deleting a task or milestone writes a `deletedAt` tombstone instead of immediately removing the record. A milestone deletion also unlinks its tasks. Tombstones protect against stale offline replicas reintroducing deleted records. History snapshots include project records and change summaries count added, updated and deleted project items. An explicit history restore is treated as an authoritative snapshot: records absent from the restored checkpoint are tombstoned, and records present in that checkpoint are reactivated.

## Manual verification

1. Open Rooms and use **Room +** to create a Board. Add a task and a milestone, assign the task to yourself, and link it to a selected canvas element.
2. Open the task link and confirm the canvas selects and scrolls to the linked element.
3. Create a Notes room. Confirm the full-width Notes workspace opens without a canvas beside it. Create a task, link it to a note, and confirm the link focuses the correct note. Confirm the Project panel offers the same task/milestone types.
4. Sign in, save each room to the cloud and share it with a second account/browser. Verify task creation, edits, status changes, assignments and links synchronize. Verify a view-only collaborator cannot edit project data.
5. Disconnect one editor, delete a task from the other editor, then reconnect. Confirm the deleted task remains deleted. Test edits to different fields from two editors.
6. Export and re-import a room, duplicate a room, and restore a checkpoint. Confirm task links remain valid for their room type.

## Scope note

Assignment choices are currently the current user and collaborators active in the room. This release does not yet include a persistent team directory, comments, workload views or notification delivery.
