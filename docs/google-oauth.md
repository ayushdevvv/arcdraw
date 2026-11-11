# Google sign-in setup

ArcDraw already contains the server-side Google OAuth 2.0 authorization-code flow with state validation, nonce validation and PKCE. Google credentials belong on the backend only.

## Create the Google OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/). Create or select the ArcDraw project.
2. Open Google Auth Platform. Configure the app name, support email, audience and developer contact email. During testing, add the Google accounts you want to test as test users.
3. Open Clients and create an OAuth client with application type **Web application**.
4. Add these exact Authorized redirect URIs (scheme, path and trailing slash must match exactly):

   Local: `http://localhost:5000/api/v1/auth/google/callback`

   Production: `https://arcdraw.onrender.com/api/v1/auth/google/callback`

5. Copy the Client ID and Client Secret into the backend environment. Do not put either secret in a `VITE_` frontend variable.

## Backend environment

```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=https://arcdraw.onrender.com/api/v1/auth/google/callback
CLIENT_URL=https://arcdraw.vercel.app
CORS_ORIGINS=https://arcdraw.vercel.app
```

For local development, change `GOOGLE_CALLBACK_URL` to the localhost callback. For production, register and use the HTTPS production callback. Google requires the redirect URI to exactly match a registered URI.

## Verify

- Restart/redeploy the backend after setting environment variables.
- Open `/api/v1/auth/providers` and confirm `providers.google` is `true`.
- Test sign-in with an account included in the consent screen's test-user list while the app is in testing mode.
- After sign-in, confirm ArcDraw returns to the configured frontend and `/api/v1/auth/me` returns the user.

References: [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server).
