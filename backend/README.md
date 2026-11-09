# Arcdraw API

Independent Express + MongoDB backend for authentication, cloud boards, sharing, live collaboration and checkpoints.

```powershell
cd backend
Copy-Item .env.example .env
# Configure MongoDB and JWT secrets.
npm install
npm run dev
```

Health: `http://localhost:5000/api/v1/health`.

For live collaboration setup, share-link permissions, Socket.IO events and the two-browser test, see `../docs/collaboration.md`.

The optional room-aware research agent uses an OpenAI-compatible model API plus optional Tavily Search. Configure `AI_API_KEY`, `AI_API_BASE_URL`, `AI_MODEL`, and optionally `TAVILY_API_KEY` in `backend/.env`; see `../docs/agent.md`. Keep these provider keys on the server.

For same-Wi-Fi LAN collaboration, see `../docs/lan-collaboration.md`.
