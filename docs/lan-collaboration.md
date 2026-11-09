# LAN collaboration setup

Arcdraw's existing Socket.IO/Yjs collaboration can be used over a local network when one machine hosts the web client and API and other devices connect to that same machine's LAN address. This is a self-hosted setup, not a separate peer-to-peer mode: the host machine runs the Express API and MongoDB, and clients still use account-backed cloud-room permissions.

## Host machine

1. Find the host's private LAN IPv4 address (for example, `192.168.1.20`). Keep it on a trusted Wi-Fi/LAN.
2. In `backend/.env`, configure: 

```env
CLIENT_URL=http://192.168.1.20:5173
CORS_ORIGINS=http://192.168.1.20:5173
API_PUBLIC_URL=http://192.168.1.20:5000
COOKIE_SAME_SITE=lax
COOKIE_SECURE=false
```

3. In `frontend/.env`, configure:

```env
VITE_API_BASE_URL=http://192.168.1.20:5000/api/v1
```

4. Start the API from `backend/` with `npm run dev`. The Node HTTP server listens on the available network interfaces when no hostname is supplied. Start the client from `frontend/` with `npm run dev -- --host 0.0.0.0`.
5. Allow ports 5173 and 5000 through the host firewall only on the Private network profile.
6. From another device on the same Wi-Fi, open `http://192.168.1.20:5173`, sign in, create or open a cloud room and share its room link.

## Important boundaries

- Both users must use the exact same app origin, including the host LAN IP and port, so share links and browser cookies remain consistent.
- The browser sends API and Socket.IO traffic to the host API address configured through `VITE_API_BASE_URL`.
- The host's MongoDB must be reachable from the API process. Do not expose MongoDB's port to the LAN unless your network architecture requires it.
- Use only on a trusted network. This local HTTP setup uses `COOKIE_SECURE=false` for development; do not reuse it for public internet deployment. Production deployment must use HTTPS and secure cookies.
- OAuth callback URLs and email delivery may require separate provider configuration; password login on an existing account is the simplest LAN smoke test.
- This setup is host-and-server mediated collaboration, not peer-to-peer WebRTC. Offline local editing still works, but another device cannot join a purely local IndexedDB room until it is saved to the cloud room service.
