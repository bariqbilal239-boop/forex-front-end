// Site content edited from Pages, Menus, Markets and Settings, plus the admin bootstrap payload.
import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { db } from "../db.js";
import { emailEnabled } from "../services/mailer.js";
import { getMarkets, marketStatus } from "../services/markets.js";
import { str } from "../util.js";
import { toPost } from "./posts.js";

const router = Router();

const getSetting = (key, fallback) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? JSON.parse(row.value) : fallback;
};
const setSetting = (key, value) => db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, JSON.stringify(value));

/** Trim every string in a JSON-safe value. */
const limitStrings = (v) => JSON.parse(JSON.stringify(v ?? null, (_, x) => (typeof x === "string" ? x.slice(0, 4000) : x)));

// Public: hero, menus, disclaimer, contact details for the website
router.get("/public/site", (req, res) => res.json(getSetting("site", {})));

// Public: cached market prices (mode "sample" until a provider key is configured)
router.get("/public/markets", (req, res) => res.json(getMarkets()));

// Admin: everything the panel needs on load
router.get("/admin", requireAdmin, (req, res) => {
  res.json({
    posts: db.prepare("SELECT * FROM posts ORDER BY updated DESC").all().map(toPost),
    site: getSetting("site", {}),
    forms: getSetting("forms", {}),
    messages: db.prepare("SELECT * FROM messages ORDER BY at DESC").all(),
    subscribers: db.prepare("SELECT email, source, at, status FROM subscribers ORDER BY at DESC").all(),
    integrations: { markets: marketStatus(), email: emailEnabled() },
  });
});

// Admin: save one settings screen (raw field values) and the site content derived from it
router.put("/forms/:view", requireAdmin, (req, res) => {
  const view = req.params.view;
  if (!/^[a-z]{1,20}$/.test(view)) return res.status(400).json({ error: "Bad form name." });

  const forms = getSetting("forms", {});
  forms[view] = (Array.isArray(req.body.values) ? req.body.values : []).slice(0, 300).map((v) => (typeof v === "boolean" ? v : str(v, 4000)));
  setSetting("forms", forms);

  if (req.body.site && typeof req.body.site === "object") {
    const site = getSetting("site", {});
    for (const [k, v] of Object.entries(req.body.site)) site[str(k, 40)] = limitStrings(v);
    setSetting("site", site);
  }
  res.json({ ok: true });
});

export default router;
