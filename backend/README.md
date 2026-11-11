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

The room-aware Design Agent uses LangGraph.js and the Groq OpenAI-compatible API. Configure `AI_API_KEY`, `AI_API_BASE_URL`, `AI_MODEL`, and `AI_REQUEST_TIMEOUT_MS` in `backend/.env`; see `../docs/agent.md`. Keep these provider keys on the server. The default model remains `openai/gpt-oss-120b`.

Authentication OTP and password-reset email delivery use the Brevo Transactional Email API. Configure `BREVO_API_KEY`, `MAIL_FROM_NAME`, and `MAIL_FROM_EMAIL`; see `../docs/brevo-email.md`. SMTP/Nodemailer is no longer used.

For same-Wi-Fi LAN collaboration, see `../docs/lan-collaboration.md`.
