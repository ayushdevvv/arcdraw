# Arcdraw visual system

Strict black and white. Pure grayscale tokens in light and dark, red only for destructive actions.

- Font: Geist Variable and Geist Mono Variable, bundled with fontsource so the app works offline.
- Shape: sharp rectangles for buttons, inputs, menus, panels and dialogs. Hairline borders.
- Tokens live in `frontend/src/styles.css` (`:root` for light, `html[data-theme="dark"]` for dark). Every other stylesheet reads these tokens.
- Dropdowns use `frontend/src/components/Menu.jsx` (keyboard navigation, Escape, outside click).

## Layout

- Workspace: left sidebar (create menu, library, folders, account menu) and a room grid with real board thumbnails.
- Board room: Excalidraw menu top left, title beside it, Share and presence top right, tool dock right centre, save and sync status bottom left, floating panels for Project, Agent and Studio.
- Notes room: library sidebar, one calm page, floating format bar, floating title and share clusters, same dock and panels.
