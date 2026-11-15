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

## `/auth/me` and `/auth/refresh` return 401

At startup the web client checks `/auth/me`, then tries `/auth/refresh` if the
access session is missing or expired. Both returning 401 is expected for a
signed-out visitor with no valid refresh cookie; the app should continue as a
guest. It is an authentication issue only when a user expects to remain signed
in.

For the current split deployment (`arcdraw.vercel.app` calling
`arcdraw.onrender.com`), confirm the Render service has:

```env
COOKIE_SAME_SITE=none
COOKIE_SECURE=true
CORS_ORIGINS=https://arcdraw.vercel.app
CLIENT_URL=https://arcdraw.vercel.app
```

The client must use `VITE_API_BASE_URL=https://arcdraw.onrender.com/api/v1`.
The API already sends credentialed CORS responses and the frontend already
uses `credentials: "include"`. Do not set a shared `COOKIE_DOMAIN` across the
Vercel and Render hostnames. Check the browser's Application/Storage cookie
panel and the login response's `Set-Cookie` headers for blocked-cookie reasons.
Browsers and privacy extensions can block third-party cookies even when
`SameSite=None; Secure` is configured. A more robust production arrangement
is to put the web app and API on subdomains of the same custom domain, such as
`app.example.com` and `api.example.com`.

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
