# Arcdraw frontend authentication

The React account UI is implemented in `frontend/src/features/auth/AuthPage.jsx`.

## Routes

| Hash route | Purpose |
|---|---|
| `#/auth/login` | Email/password sign-in and enabled social providers |
| `#/auth/register` | Create a password account |
| `#/auth/verify` | Verify the email with an 8-digit OTP |
| `#/auth/forgot` | Request a password-reset OTP |
| `#/auth/reset` | Set a new password with the reset OTP |

## Architecture

- `context/AuthContext.jsx` owns the signed-in user state.
- `services/authService.js` wraps the existing backend authentication endpoints.
- `services/apiClient.js` sends requests with `credentials: include` so browser-managed HTTP-only cookies are sent.
- `GET /api/v1/auth/providers` advertises whether Google and GitHub OAuth are configured. It returns booleans only, never client secrets.
- `AuthProvider` checks `/auth/me` on startup. The authentication cookie has no app-defined max-age, JWT expiry, refresh cycle or inactivity timeout; sessions end only on explicit sign-out or sign-out-all. The browser controls the lifetime of a session cookie.
- The access credential stays in an HTTP-only cookie and is never exposed to JavaScript or browser storage.
- `AuthPage` calls the existing email OTP endpoints and only displays `developmentOtp` when the backend returns that development-only field.

## Guest behavior

Guest boards remain in IndexedDB under the existing guest ID. Signing in does not yet migrate guest boards to a cloud workspace. The workspace currently labels the board collection as local even when the user is signed in. Guest-to-account migration and cloud synchronization are future milestones.

## Local setup

1. Start the backend from `backend/` and confirm `/api/v1/health` responds.
2. Set `CLIENT_URL=http://localhost:5173` and `CORS_ORIGINS=http://localhost:5173` in `backend/.env`.
3. Configure Google/GitHub credentials if those buttons should appear.
4. Start the client from `frontend/`.
5. Open `http://localhost:5173/#/auth/login`.

Without OAuth credentials, social buttons are intentionally hidden. Without Brevo configured in development, the backend can return `developmentOtp`; production requires a valid Brevo API key and verified sender.
