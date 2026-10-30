# Aurum Markets — Backend & Admin Panel

Node.js (Express 5) API with a built-in SQLite database, the admin panel / blog CMS,
branded email templates (SMTP) and a market-data integration (Twelve Data).
Works with the Next.js website in [forex-website](https://github.com/bariqbilal239-boop/forex-website).

## Run

Requires **Node.js 22.5+** (uses the built-in `node:sqlite`).

```bash
npm install
cp .env.example .env   # optional
npm start              # http://localhost:5173/admin.html
```

On first start it creates `data/aurum.db` and `data/first-login.txt` with the admin email and a
random password. Sign in, then delete that file. Back up by copying the `data/` folder.

## Structure

```
src/
  server.js          Express app, security headers, CORS, static admin panel
  env.js             .env loader
  db.js              SQLite schema + first-run admin and sample posts
  auth.js            Cookie sessions, requireAdmin middleware (CSRF header check)
  util.js            Password hashing, HTML cleaning, rate limiting, helpers
  routes/
    auth.js          login, logout, me, change password
    posts.js         blog posts (public read, admin CRUD)
    audience.js      contact messages, replies, newsletter (double opt-in), campaigns
    site.js          site content, market prices, admin bootstrap
  services/
    mailer.js        SMTP sending (saves to data/outbox/ when SMTP isn't configured)
    markets.js       Twelve Data price feed with caching
  emails/
    templates.js     All email templates (HTML + plain text)
public/
  admin.html         Admin panel UI
  cms-admin.js       Connects the admin panel to the API
```

## API

| Method | Path | Access |
|---|---|---|
| GET | `/api/public/posts?category=` | Public — published posts |
| GET | `/api/public/posts/:slug` | Public — one post |
| GET | `/api/public/site` | Public — hero, disclaimer, social links |
| GET | `/api/public/markets` | Public — cached prices (`mode`: `sample` or `delayed`) |
| GET | `/api/subscribers/confirm?token=` · `/api/subscribers/unsubscribe?token=` | Public — email links |
| POST | `/api/messages` | Public — contact form |
| POST | `/api/subscribers` | Public — newsletter sign-up |
| POST | `/api/login` · `/api/logout` · `/api/password` | Admin auth |
| GET | `/api/me` · `/api/admin` | Admin |
| POST/PUT/DELETE | `/api/posts[/:id]` | Admin |
| PUT/DELETE | `/api/messages/:id` | Admin |
| POST | `/api/messages/:id/reply` | Admin — email a reply |
| POST | `/api/campaigns` | Admin — send newsletter (`test: true` sends only to you) |
| GET | `/api/emails/preview/:name` | Admin — preview a template |
| DELETE | `/api/subscribers/:email` | Admin |
| PUT | `/api/forms/:view` | Admin — save Pages/Menus/Markets/Settings |

Admin write requests must send the header `X-Requested-With: aurum`.
Public endpoints allow CORS from `CORS_ORIGINS` (default `http://localhost:3000`).

## Environment variables

Copy `.env.example` to `.env`. Values don't need quotes.

| Variable | Required | What it does |
|---|---|---|
| `PORT` | no | Port to listen on (default 5173) |
| `NODE_ENV` | prod | `production` makes the login cookie HTTPS-only |
| `PUBLIC_API_URL` | prod | Public URL of this backend, used in email links |
| `SITE_URL` | prod | Public URL of the Next.js website |
| `SITE_NAME` | no | Brand name in emails (default "Aurum Markets") |
| `CORS_ORIGINS` | no | Sites allowed to call the public API from the browser |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | first run | First admin account; empty password → random one in `data/first-login.txt` |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` | for email | Your email provider's SMTP settings. Empty host → emails saved to `data/outbox/` |
| `EMAIL_FROM` | for email | Sender, e.g. `"Aurum Markets" <news@yourdomain.com>` (verify the domain with your provider) |
| `ADMIN_NOTIFY_EMAIL` | no | Receives a copy of every contact-form message |
| `TWELVE_DATA_API_KEY` | for prices | Real (delayed) prices. Empty → sample prices labelled "Illustrative sample" |
| `MARKET_REFRESH_MINUTES` | no | Refresh interval, min 5, default 20 (fits the free plan) |

## Emails

| Template | Sent when |
|---|---|
| Confirm subscription | Someone signs up (double opt-in) |
| Welcome | They click the confirm link |
| Campaign | You send a newsletter from **Admin → Newsletter → New campaign** |
| Contact auto-reply | Someone sends the contact form |
| Contact notification | Same, to `ADMIN_NOTIFY_EMAIL` |
| Contact reply | You reply from **Admin → Contact Inbox** |
| Password changed | An admin changes their password |

Preview them in **Admin → Newsletter → Email templates**. Campaign emails include an unsubscribe link and one-click
`List-Unsubscribe` headers (required by Gmail and Yahoo for bulk senders).

## Production notes

- Serve behind HTTPS (Nginx / Caddy) and set `NODE_ENV=production` so cookies are `Secure`.
- Twelve Data's free plan provides delayed data for personal use; check their licence terms (and upgrade if needed) before showing prices on a public commercial site.
- Set up SPF, DKIM and DMARC for your sending domain so emails don't land in spam.
