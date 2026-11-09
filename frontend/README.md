# Arcdraw Client

Independent React JSX + Vite application.

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`.

The local canvas uses Excalidraw. Dexie/IndexedDB stores device-local boards and Yjs replicas. Live cloud collaboration uses Socket.IO when a board has been saved to the cloud and the user is signed in.

For two-user sharing and collaboration testing, see `../docs/collaboration.md`. For same-Wi-Fi hosting, see `../docs/lan-collaboration.md`.
