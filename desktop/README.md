# ArcDraw Desktop

ArcDraw Desktop is the Electron distribution of the existing ArcDraw React application. It bundles the web renderer locally, keeps a persistent IndexedDB origin for room and Yjs data, stores desktop auth credentials in Electron's OS-backed `safeStorage`, and proxies API and Socket.IO traffic through the main process.

## Requirements

- Windows 10 or 11, 64-bit for the initial public installer
- Node.js 22.12 or newer for local development/builds
- npm

## Run locally

From the repository root:

```powershell
cd frontend
npm ci
npm run build:desktop
cd ..\desktop
npm install
npm run start:app
```

To rebuild the renderer and launch Electron in one command:

```powershell
npm start
```

## Build the Windows installer locally

```powershell
cd frontend
npm ci
npm run build:desktop
cd ..\desktop
npm install
npm run dist:win
```

The installer is written to `desktop/dist/ArcDraw-Setup.exe`.

For a one-command Windows build, run this from the repository root in PowerShell:

```powershell
.\desktop\scripts\build-windows.ps1
```

Before publishing, deploy the matching `backend` source to Render and the matching `frontend` source to Vercel. Desktop sign-in uses the new one-time OAuth exchange endpoint, and the desktop workspace index uses the new authenticated `GET /api/v1/boards` endpoint.

## Publish a public release

The repository includes `.github/workflows/release-desktop.yml`. Push the completed source to `ayushdevvv/arcdraw`, then create and push a version tag matching the `desktop/package.json` version:

```powershell
git tag v0.15.5
git push origin v0.15.5
```

GitHub Actions builds the Windows renderer and NSIS installer on `windows-latest`, then publishes `ArcDraw-Setup.exe` and Electron update metadata to the GitHub release using the repository's built-in `GITHUB_TOKEN`.

The website's Windows download button points to the stable release asset. It will return a 404 until the first successful tagged desktop release is published.

The website's Windows download button points to:

`https://github.com/ayushdevvv/arcdraw/releases/latest/download/ArcDraw-Setup.exe`

After the first successful tagged release, that URL serves the latest installer without needing a new website URL for every release.

## Desktop architecture

- **Renderer:** the same React/Vite app as the web product, bundled into the installer.
- **Stable local origin:** `http://127.0.0.1:43127`, so IndexedDB and local storage survive app restarts.
- **Local persistence:** Dexie/IndexedDB for rooms, notes, project items and folders; `y-indexeddb` for Yjs document updates.
- **Cloud:** REST requests are proxied to the ArcDraw Vercel origin; Socket.IO is proxied to the existing Render realtime service.
- **Credentials:** access and refresh credentials remain in Electron's main process and are encrypted with `safeStorage`; the renderer only receives the public user profile.
- **Google/GitHub:** the app opens the system browser and uses a short-lived, one-time desktop OAuth handoff code to return to the app.
- **Updates:** packaged builds check the GitHub release feed and can install a downloaded update after restart.

## Offline behaviour

Downloaded rooms are stored on the computer. Canvas updates are persisted through Yjs IndexedDB; notes, tasks, milestones and room metadata are stored in Dexie. A user's cloud room index is cached locally, while each room's full scene is downloaded the first time it is opened. This avoids downloading every large room during sign-in.

After a room has been opened once, its local canvas, notes and project data remain available offline. Live presence, messaging, the design agent, invitations, commits and other server-dependent actions require a connection. Yjs changes made while offline are retained locally and the collaboration provider retries on reconnection, where its full-document sync path merges the local CRDT update with the server document.

Guest-only rooms created in a separate browser profile are not magically transferred to a desktop install. Sign in on the web and use the existing **Sync local rooms** action to move those drafts into the cloud before using them on another device.

## Security notes

The renderer runs with `nodeIntegration: false`, `contextIsolation: true`, sandboxing and web security enabled. Tokens are never placed in renderer local storage. The loopback bridge rejects cross-origin requests and only accepts its own host. OAuth is performed in the system browser rather than an embedded provider webview.

The first Windows release is not Authenticode-signed because no publisher certificate has been supplied. Windows SmartScreen may show an unknown-publisher warning. Do not disable Windows security controls; install only from the official ArcDraw release page.
