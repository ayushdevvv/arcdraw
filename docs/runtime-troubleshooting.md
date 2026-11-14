# Runtime troubleshooting

## React `Maximum update depth exceeded` in the room editor

The Excalidraw API callback must keep a stable identity. Passing an inline
`excalidrawAPI` callback from `RoomEditor` caused Excalidraw to unregister and
register it on every parent render. The callback is now memoized with
`useCallback`; the initial scene and UI options are also kept stable, and
selection state is only updated when the selected IDs actually change.

## React error #310 when opening a room

React error #310 means a component rendered a different number of hooks than
it did on its previous render. In v0.11.0, `RoomEditor` declared the image
picker's `useRef` after its loading and error early returns. The initial
loading render skipped that hook; the loaded render reached it and crashed.
The ref now lives with the other top-level hooks, before either early return.
Keep every React hook unconditional and above loading/error returns when
adding future room-editor controls.

## `/auth/me` returns 401

The current build does not use a refresh-token endpoint. A 401 means the cookie is missing, malformed, or its server-side session was explicitly revoked. Sign in again, then confirm the API and frontend share the intended cookie domain, HTTPS setting, and SameSite configuration.
