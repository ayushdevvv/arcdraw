# Brevo transactional email setup

ArcDraw uses the Brevo Transactional Email API for account-verification OTPs and password-reset OTPs. SMTP and Nodemailer are no longer used.

## Set up Brevo

1. Create or sign in to a [Brevo account](https://app.brevo.com/).
2. In the Brevo dashboard, open **Settings → SMTP & API → API keys** (the exact menu label may vary) and generate an API key. Use an API key, not an SMTP key.
3. Open Senders & IP / Senders and Domains, add your sender identity and verify it. For a production domain, configure the DNS records Brevo provides (typically DKIM and SPF; configure DMARC for the domain as well).
4. Use an email address on the verified sender/domain as `MAIL_FROM_EMAIL`.

## Backend environment

```env
BREVO_API_KEY=xkeysib-your-brevo-api-key
MAIL_FROM_NAME=ArcDraw
MAIL_FROM_EMAIL=no-reply@your-verified-domain.com
```

Add these variables to Render's backend service. Do not add them to Vercel or any `VITE_` variable. The backend calls `POST https://api.brevo.com/v3/smtp/email` with the `api-key` header and static HTML + text content for each OTP email.

## Test the flow

1. Redeploy the backend with the Brevo variables.
2. Create a new ArcDraw account and confirm the verification OTP arrives.
3. Use Forgot password and confirm the reset OTP arrives.
4. If delivery fails, inspect Render logs for the Brevo HTTP status. A 401 generally means the API key is wrong; a sender/domain rejection means the sender is not verified or does not match the Brevo account.
5. Check Brevo transactional logs for delivery, bounce and block events.

References: [Brevo Send a transactional email](https://developers.brevo.com/docs/send-a-transactional-email).
