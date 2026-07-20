# Deploying to Railway

The project runs as **a single process**: `npm start` serves the built frontend
(`dist/`), the API (`/api/*`), and Socket.IO from one port. Railway installs
dependencies, runs `npm run build`, then `npm start` (see `railway.json`).
Database migrations are applied automatically on server startup.

## Environment variables

Set these in the Railway service (Variables tab):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Reference to the Postgres plugin: `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | A long random string. Never publish it. |
| `NODE_ENV` | `production` |
| `NPM_CONFIG_PRODUCTION` | `false` — otherwise devDependencies are skipped and the build fails with `tsc: not found` |
| `RESEND_API_KEY` | Resend API key (starts with `re_`). Email goes over Resend's HTTP API because Railway blocks SMTP ports. |
| `MAIL_FROM` | `"Chess 2 · ASCENT" <noreply@your-domain>` — an address on a domain verified in Resend |
| `APP_URL` | The public site URL, e.g. `https://chess2-ascent.online` (used for links in emails; never `localhost`) |
| `TOTP_ENCRYPTION_KEY` | 32-byte key in hex (64 characters) that encrypts 2FA secrets |

**`TOTP_ENCRYPTION_KEY` must match your local `.env`.** If it differs, already
enrolled users' 2FA secrets can no longer be decrypted after a deploy. Generate a
fresh one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Railway sets `PORT` itself — leave it alone. If you connect to the **public**
database address (not the internal `*.railway.internal` one) and it requires TLS,
add `DATABASE_SSL=1`.

## Option 1 — via GitHub (recommended)

1. Push the repository to GitHub.
2. In Railway: **New → Deploy from GitHub repo**, and pick the repository.
3. Add the **PostgreSQL** plugin if it isn't there yet, and set the variables above.
4. Railway builds and starts the project. Every `git push` triggers a new deploy.

## Option 2 — via Railway CLI (no GitHub)

```bash
npm i -g @railway/cli
railway login          # opens a browser to sign in
railway link           # select an existing project
railway up             # build and deploy the current folder
```

Environment variables are set in the Railway dashboard exactly as in option 1.

## After deploying

- Open the Railway-issued domain — the game should load.
- Health check: `https://<domain>/api/health` → `{"ok":true,"db":"ok"}`.
- Register your first account on the site itself; the database and tables are
  created by the migration on first startup.

## Domain and email

The production site is served from `chess2-ascent.online` — a custom Railway
domain proxied through Cloudflare, which also holds the domain's nameservers.
The same domain is verified in Resend so that transactional email
(verification, password reset, 2FA) is sent from an address on it.
