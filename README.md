# Aurum Markets — Backend & Admin Panel

Node.js (Express 5) API with a built-in SQLite database, plus the admin panel / blog CMS.
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
    audience.js      contact messages and newsletter subscribers
    site.js          site content (hero, menus, settings) and admin bootstrap
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
| POST | `/api/messages` | Public — contact form |
| POST | `/api/subscribers` | Public — newsletter sign-up |
| POST | `/api/login` · `/api/logout` · `/api/password` | Admin auth |
| GET | `/api/me` · `/api/admin` | Admin |
| POST/PUT/DELETE | `/api/posts[/:id]` | Admin |
| PUT/DELETE | `/api/messages/:id` | Admin |
| DELETE | `/api/subscribers/:email` | Admin |
| PUT | `/api/forms/:view` | Admin — save Pages/Menus/Markets/Settings |

Admin write requests must send the header `X-Requested-With: aurum`.
Public endpoints allow CORS from `CORS_ORIGINS` (default `http://localhost:3000`).

## Production notes

- Serve behind HTTPS (Nginx / Caddy) and set `NODE_ENV=production` so cookies are `Secure`.
- Market prices are still sample data; connect a market-data provider before showing live prices.
