# GitHub sign-in setup

ArcDraw already contains the server-side GitHub OAuth authorization-code flow with state validation and PKCE. It requests only `read:user` and `user:email`; it does not request repository access.

## Create the GitHub OAuth App

1. Open GitHub → Settings → Developer settings → OAuth Apps.
2. Choose **New OAuth App**.
3. Application name: `ArcDraw` (or your preferred public app name).
4. Homepage URL: `https://arcdraw.vercel.app`.
5. Authorization callback URL: `https://arcdraw.onrender.com/api/v1/auth/github/callback`.
6. Register the app, generate a client secret and copy the Client ID and secret.

For local development, create a separate development OAuth App with homepage `http://localhost:5173` and callback `http://localhost:5000/api/v1/auth/github/callback`. Keeping a separate development app avoids changing the production callback when switching environments. ArcDraw uses only the `read:user` and `user:email` scopes for profile/email sign-in; it does not need repository access.

## Backend environment

```env
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=https://arcdraw.onrender.com/api/v1/auth/github/callback
CLIENT_URL=https://arcdraw.vercel.app
CORS_ORIGINS=https://arcdraw.vercel.app
```

Add these variables to Render's backend service, then redeploy. Never put the GitHub client secret in a `VITE_` variable.

## Verify

- Open `/api/v1/auth/providers` and confirm `providers.github` is `true`.
- Test with a GitHub account that has a verified primary email address.
- Confirm the app returns to `https://arcdraw.vercel.app` and `/api/v1/auth/me` returns the user.

References: [Create a GitHub OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app) and [Authorize an OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).
