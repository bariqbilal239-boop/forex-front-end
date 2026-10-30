// Site content edited from Pages, Menus, Markets and Settings, plus the admin bootstrap payload.
import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { all, getSetting, setSetting } from "../db.js";
import { emailEnabled } from "../services/mailer.js";
import { getMarkets, marketStatus } from "../services/markets.js";
import { str, wrap } from "../util.js";
import { toPost } from "./posts.js";

const router = Router();

/** Trim every string in a JSON-safe value. */
const limitStrings = (v) => JSON.parse(JSON.stringify(v ?? null, (_, x) => (typeof x === "string" ? x.slice(0, 4000) : x)));

// Public: hero, menus, disclaimer, contact details for the website
router.get("/public/site", wrap(async (req, res) => res.json(await getSetting("site", {}))));

// Public: cached market prices (mode "sample" until a provider key is configured)
router.get("/public/markets", wrap(async (req, res) => res.json(await getMarkets())));

// Admin: everything the panel needs on load
router.get("/admin", requireAdmin, wrap(async (req, res) => {
  const [posts, site, forms, messages, subscribers, markets] = await Promise.all([
    all("SELECT * FROM posts ORDER BY updated DESC"),
    getSetting("site", {}),
    getSetting("forms", {}),
    all("SELECT * FROM messages ORDER BY at DESC"),
    all("SELECT email, source, at, status FROM subscribers ORDER BY at DESC"),
    marketStatus(),
  ]);
  res.json({ posts: posts.map(toPost), site, forms, messages, subscribers, integrations: { markets, email: emailEnabled() } });
}));

// Admin: save one settings screen (raw field values) and the site content derived from it
router.put("/forms/:view", requireAdmin, wrap(async (req, res) => {
  const view = req.params.view;
  if (!/^[a-z]{1,20}$/.test(view)) return res.status(400).json({ error: "Bad form name." });

  const forms = await getSetting("forms", {});
  forms[view] = (Array.isArray(req.body.values) ? req.body.values : []).slice(0, 300).map((v) => (typeof v === "boolean" ? v : str(v, 4000)));
  await setSetting("forms", forms);

  if (req.body.site && typeof req.body.site === "object") {
    const site = await getSetting("site", {});
    for (const [k, v] of Object.entries(req.body.site)) site[str(k, 40)] = limitStrings(v);
    await setSetting("site", site);
  }
  res.json({ ok: true });
}));

export default router;
