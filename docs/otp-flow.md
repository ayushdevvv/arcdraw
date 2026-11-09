# Email OTP flows

Arcdraw uses an 8-digit numeric OTP for email ownership verification and password recovery.

## Policy

- 8 digits, generated using Node's cryptographic `randomInt`.
- 10-minute TTL.
- Single use.
- Five incorrect attempts maximum per issued code.
- 60-second resend cooldown.
- HMAC-SHA256 hash stored using `OTP_HASH_SECRET` (fallback: `JWT_ACCESS_SECRET`).
- API endpoints additionally use IP-based rate limiting.

## Registration

1. Validate name, email and password.
2. Normalize email and reject an existing account.
3. Hash password and create inactive/unverified account.
4. Generate and email an OTP.
5. User submits email + OTP to `POST /api/v1/auth/verify-email`.
6. Verify hash, TTL and attempt count, mark email verified and clear OTP fields.
7. User can now log in.

## Password reset

1. User submits an email to `POST /api/v1/auth/forgot-password`.
2. Send a generic response regardless of account existence.
3. If a password account exists, generate and email a reset OTP.
4. User submits email + OTP + new password to `POST /api/v1/auth/reset-password`.
5. Verify and consume the code, update the password, and revoke all active sessions.

## Guest access

Guests do not receive API credentials. Their future boards and notes are stored in browser/desktop local databases. Account authentication is required for cloud save, sharing and live collaboration. Cloud APIs must enforce this on the server using `requireAccount`.
