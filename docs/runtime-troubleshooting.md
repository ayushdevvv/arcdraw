# Runtime troubleshooting

## React `Maximum update depth exceeded` in the room editor

The Excalidraw API callback must keep a stable identity. Passing an inline
`excalidrawAPI` callback from `RoomEditor` caused Excalidraw to unregister and
register it on every parent render. The callback is now memoized with
`useCallback`; the initial scene and UI options are also kept stable, and
selection state is only updated when the selected IDs actually change.

## Socket.IO connection failures

Cloud collaboration requires the Express API and MongoDB-backed server to be
running. Start the server from `backend/` and check that it reports that it is
listening on port `5000` (or the configured `PORT`). The client defaults to
`http://localhost:5000/api/v1`; set `VITE_API_BASE_URL` in `frontend/.env` if the
API is hosted elsewhere. The client starts with Socket.IO polling and upgrades
to WebSocket when available, so networks or reverse proxies that block WebSocket
upgrades can still use polling.

For a different device on the same Wi-Fi, do not use `localhost` in the client
URL. Use the LAN address of the machine running the API, and allow the client
origin in the server's `CORS_ORIGINS`. Both devices must be able to reach the
API host and port. Cloud collaboration also requires an authenticated session;
local guest rooms remain available without the cloud socket.

## Non-fatal browser messages

- The React DevTools message is an optional development suggestion.
- Chrome's slow-network font message means a fallback font is displayed while
  Excalidraw's Assistant font files load; it is not itself a React crash.
- The `unload` permissions-policy warning is emitted by browser/library code
  attempting to use a restricted unload behavior. It is separate from the
  React render loop and normally does not prevent editing.
