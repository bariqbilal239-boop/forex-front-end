# Aurum Markets — Backend & Admin Panel

Node.js (Express 5) API with a **MongoDB Atlas** database, ready to deploy on **Vercel**, the admin panel / blog CMS,
branded email templates (SMTP) and a market-data integration (Twelve Data).
Works with the Next.js website in [forex-website](https://github.com/bariqbilal239-boop/forex-website).

## Run

Requires **Node.js 20+**.

```bash
npm install
cp .env.example .env   # optional
npm start              # http://localhost:5173/admin.html
```

Set `MONGODB_URI` in `.env` (see `.env.example`). On first start it creates the collections, indexes, sample posts and
the admin account from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (locally, an empty password is generated into `data/first-login.txt`).

## Deploy on Vercel

1. In MongoDB Atlas: **Network Access → Add IP Address → Allow access from anywhere (`0.0.0.0/0`)** — Vercel has no fixed IP. Copy your connection string.
2. Import this repo in Vercel. Framework preset: **Other**. No build command needed (`vercel.json` handles it).
3. Add the environment variables below (at least `MONGODB_URI`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PUBLIC_API_URL`, `SITE_URL`, `CORS_ORIGINS`).
4. Deploy. The admin panel is at `https://<your-backend>.vercel.app/admin.html`.

How it fits serverless: `api/index.js` runs the Express app as one function; `public/` (admin panel) is served by Vercel's CDN;
the MongoDB connection is reused between requests; market prices are cached in the database and refreshed on demand
(no timers); emails are sent before each response finishes; expired login sessions are removed by a MongoDB TTL index.

## Structure

```
src/
  app.js             Express app, security headers, CORS
  server.js          Local dev server (app.listen)
  env.js             .env loader
  db.js              MongoDB connection, indexes, first-run admin and sample posts
  auth.js            Cookie sessions, requireAdmin middleware (CSRF header check)
  util.js            Password hashing, HTML cleaning, rate limiting, helpers
  routes/
    auth.js          login, logout, me, change password
    posts.js         blog posts (public read, admin CRUD)
    audience.js      contact messages, replies, newsletter (double opt-in), campaigns
    site.js          site content, market prices, admin bootstrap
  services/
    mailer.js        SMTP sending (saves to data/outbox/ locally when SMTP isn't configured)
    markets.js       Twelve Data prices, cached in the database
  emails/
    templates.js     All email templates (HTML + plain text)
api/
  index.js           Vercel serverless entry
vercel.json          Vercel routing
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
| `MONGODB_URI` | **yes** | MongoDB Atlas connection string (`mongodb+srv://…`) |
| `MONGODB_DB` | no | Database name (default `aurum`) |
| `PORT` | no | Local port (default 5173); ignored on Vercel |
| `NODE_ENV` | prod | `production` makes the login cookie HTTPS-only |
| `PUBLIC_API_URL` | prod | Public URL of this backend, used in email links |
| `SITE_URL` | prod | Public URL of the Next.js website |
| `SITE_NAME` | no | Brand name in emails (default "Aurum Markets") |
| `CORS_ORIGINS` | no | Sites allowed to call the public API from the browser |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | first run | First admin account (required on Vercel). Only used when the database has no users |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` | for email | Your email provider's SMTP settings. Empty host → emails saved to `data/outbox/` |
| `EMAIL_FROM` | for email | Sender, e.g. `"Aurum Markets" <news@yourdomain.com>` (verify the domain with your provider) |
| `ADMIN_NOTIFY_EMAIL` | no | Receives a copy of every contact-form message |
| `TWELVE_DATA_API_KEY` | for prices | Real (delayed) prices. Empty → sample prices labelled "Illustrative sample" |
| `MARKET_REFRESH_MINUTES` | no | Price cache lifetime, min 5, default 20 (fits the free plan) |

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

- On Vercel the login rate limit is per function instance, so it is weaker than on a single server. Use a strong admin password.
- Twelve Data's free plan provides delayed data for personal use; check their licence terms before showing prices on a public commercial site.
- Set up SPF, DKIM and DMARC for your sending domain so emails don't land in spam.
- Large campaigns: Vercel functions stop after 60 seconds (`vercel.json`), so for thousands of subscribers send through your email provider's bulk tool instead.
