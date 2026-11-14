# Web-first stability checklist

Desktop/Tauri is deliberately deferred. Treat the browser/PWA as the supported product until these checks pass on the deployed web stack.

## Build and release gate

- [ ] Run `npm ci` in `frontend/` from a clean checkout.
- [ ] Run `npm run build` and fix every warning/error that affects generated assets or the service worker.
- [ ] Run `npm ci` and `npm run build` (or the backend's available checks) in `backend/`.
- [ ] Confirm production environment validation, secure cookies, CORS origins and API URLs.
- [ ] Verify the PWA install, reload, offline shell and subsequent online update.

## Board room

- [ ] Add a PNG/JPEG image with the toolbar picker, then drag/drop and paste another image.
- [ ] Reload and verify the image is still visible; open the same cloud room in a second account and verify it syncs.
- [ ] Add a sticky note, edit the text, move the group and reload.
- [ ] Save a component, insert an instance, edit text/fill/visibility properties, save a variant and test it independently.
- [ ] Update the default master and verify linked default instances update without removing compatible overrides.
- [ ] Group and ungroup shapes; test layer reorder, hide, lock and frame presets.
- [ ] Add a canvas-anchored comment, reply after selecting another object, resolve/reopen and verify persistence.

## Notes room

- [ ] Create, rename, search and delete notes.
- [ ] Test headings, lists, checklists, code blocks, pipe tables and inline images.
- [ ] Verify attached images survive refresh and sync to a second browser.
- [ ] Edit the same note from two accounts, including reconnect after offline edits.

## Project and collaboration

- [ ] Create tasks, subtasks, dependencies, milestones, labels/status and assignments.
- [ ] Verify dependency cycle choices are rejected/filtered and deleting a task cleans its references.
- [ ] Confirm task-to-canvas and task-to-note links navigate to the correct target.
- [ ] Test room chat, comment threads, viewer read-only behavior and commit/review changes.
- [ ] Test invite expiry/revocation and account sign-out, sign-out-all and password-reset revocation, including an already-open collaboration socket. Confirm there is no timed auth refresh or session expiry.
- [ ] Test two editors changing different objects, the same object, different task fields, and the same task field.

## Operational readiness

- [ ] Test near-limit rooms with multiple images; verify graceful size errors and no partial data loss.
- [ ] Implement and test automated cloud backups plus restore before storing important user work.
- [ ] Add monitoring for Socket.IO disconnects, failed snapshot persistence, MongoDB errors and storage quota failures.
- [ ] Keep deployment single-instance until a shared Socket.IO adapter and distributed persistence/checkpoint locking are implemented.
- [ ] Verify browser storage quota handling, export/restore flows and recovery after clearing site data.

## Known limitations at this milestone

- The canvas is still Excalidraw-backed. Design Studio is an enhanced toolkit with linked component masters/instances, not a full Figma-grade renderer.
- Canvas same-element conflicts remain whole-element last-writer-wins. Notes use Y.Text and project items use field-level maps.
- Discussion is available for authenticated cloud rooms; it does not yet include message deletion/editing, file attachments, @mentions or notification delivery.
- Room image payloads are embedded in the Yjs document and share the 7 MB room snapshot limit. S3-compatible asset storage and automated backup recovery are not implemented.
- Room folders are local to a browser, not a shared team folder hierarchy.
- The LAN option is host-configured and does not provide automatic peer discovery. Independent offline editing syncs when internet returns.
- The web frontend production build and live multi-browser tests must be run in an environment with working npm registry access before this release can be called stable.
