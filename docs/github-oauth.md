# GitHub OAuth setup

Arcdraw uses GitHub's OAuth 2.0 authorization-code flow with PKCE S256.

## Local callback

`http://localhost:5000/api/v1/auth/github/callback`

## GitHub OAuth App

1. Open GitHub Settings → Developer settings → OAuth Apps.
2. Create an OAuth App.
3. Set the homepage URL to `http://localhost:5173`.
4. Set the Authorization callback URL to the local callback above.
5. Generate a client secret.
6. Add `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and `GITHUB_CALLBACK_URL` to `backend/.env`.

Arcdraw requests `read:user` and `user:email`. The server verifies the OAuth state, uses PKCE, exchanges the authorization code server-side, retrieves `/user` and `/user/emails`, and requires a verified primary email. It does not request repository access.

The provider access token is used only to retrieve the GitHub profile/email during sign-in and is not persisted as an Arcdraw session token. Arcdraw issues its own HTTP-only session cookies.

For production, register the exact HTTPS callback URL in GitHub and set the same URL in the server environment.
