// The Express app. Used by src/server.js (local) and api/index.js (Vercel).
import "./env.js";
import express from "express";
import path from "node:path";
import { ready } from "./db.js";
import audience from "./routes/audience.js";
import auth from "./routes/auth.js";
import posts from "./routes/posts.js";
import site from "./routes/site.js";

const ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:3000").split(",").map((s) => s.trim().replace(/\/$/, ""));

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", process.env.VERCEL ? true : "loopback");
app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// CORS for the Next.js website — public endpoints only
const PUBLIC_API = /^\/api\/(public\/|messages$|subscribers$)/;
app.use((req, res, next) => {
  const origin = req.get("Origin");
  if (origin && ORIGINS.includes(origin) && PUBLIC_API.test(req.path)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST");
    if (req.method === "OPTIONS") return res.sendStatus(204);
  }
  next();
});

// Wait for the database schema (instant after the first request on each instance)
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  ready.then(() => next(), next);
});
app.use("/api", auth, posts, audience, site);
app.use("/api", (req, res) => res.status(404).json({ error: "Unknown endpoint." }));

app.get("/health", (req, res) => res.json({ ok: true }));

// Admin panel. On Vercel these files are served from public/ by the CDN instead.
app.use(express.static(path.resolve("public"), { index: "admin.html" }));
app.get("/admin", (req, res) => res.redirect("/admin.html"));

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
  console.error(err);
  res.status(500).json({ error: "Server error." });
});

export default app;
