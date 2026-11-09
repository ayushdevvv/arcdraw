# Google OAuth configuration

Arcdraw uses a server-side OAuth 2.0 authorization-code flow.

## Local callback URL

`http://localhost:5000/api/v1/auth/google/callback`

## Google Cloud Console

1. Create/select a project.
2. Configure Google Auth Platform consent screen and test users if the app is in testing mode.
3. Create an OAuth client ID of type Web application.
4. Add the callback URL above under Authorized redirect URIs.
5. Copy the client ID and secret into `backend/.env`.

## Flow protections

- Random `state` is stored in a short-lived HTTP-only cookie and compared on callback.
- Random `nonce` is sent in the authorization request and checked against the verified ID-token payload.
- PKCE (S256) binds the authorization code to a short-lived, HTTP-only code-verifier cookie.
- ID token audience is checked against the configured OAuth client ID.
- Only profiles with a Google-verified email are accepted.
- Google client secret never reaches the browser.

For production, register the exact HTTPS callback URL in Google Cloud and keep the server environment in sync.
