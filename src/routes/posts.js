import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { all, one, run } from "../db.js";
import { cleanHtml, randomId, slugify, str, wrap } from "../util.js";

const router = Router();

const TEXT_FIELDS = ["title", "subtitle", "category", "author", "label", "status", "date", "visibility", "image", "imageAlt", "metaTitle", "metaDesc"];
const FLAGS = ["featured", "newsletter", "breaking"];
const STATUSES = ["Draft", "In review", "Scheduled", "Published"];
const COLUMNS = ["id", "slug", ...TEXT_FIELDS, "body", "tags", ...FLAGS, "mins", "views", "updated"];

/** DB row → API object */
export const toPost = (r) =>
  r && { ...r, tags: JSON.parse(r.tags || "[]"), featured: !!r.featured, newsletter: !!r.newsletter, breaking: !!r.breaking, excerpt: r.subtitle };

const isLive = (p) => p.status === "Published" || (p.status === "Scheduled" && p.date && new Date(p.date) <= new Date());

async function uniqueSlug(base, id) {
  let slug = slugify(base);
  while (await one("SELECT 1 AS x FROM posts WHERE slug = ? AND id != ?", slug, id)) slug = `${slugify(base)}-${randomId(2)}`;
  return slug;
}

async function save(existing, body) {
  const p = existing ? { ...existing } : { id: randomId(), title: "Untitled post", status: "Draft", views: 0, tags: [], mins: 1 };
  for (const k of TEXT_FIELDS) if (body[k] !== undefined) p[k] = str(body[k], k === "metaDesc" ? 400 : 300);
  for (const k of FLAGS) if (body[k] !== undefined) p[k] = !!body[k];
  if (!STATUSES.includes(p.status)) p.status = "Draft";
  if (Array.isArray(body.tags)) p.tags = body.tags.slice(0, 20).map((t) => str(t, 40));
  if (body.body !== undefined) {
    p.body = cleanHtml(body.body).slice(0, 500_000);
    p.mins = Math.max(1, Math.round(p.body.replace(/<[^>]+>/g, " ").split(/\s+/).length / 220));
  }
  p.slug = await uniqueSlug(body.slug || p.slug || p.title, p.id);
  p.updated = Date.now();

  const row = { ...p, tags: JSON.stringify(p.tags || []), featured: +!!p.featured, newsletter: +!!p.newsletter, breaking: +!!p.breaking };
  await run(`INSERT OR REPLACE INTO posts (${COLUMNS.join(",")}) VALUES (${COLUMNS.map(() => "?").join(",")})`, ...COLUMNS.map((c) => row[c] ?? null));
  return toPost(await one("SELECT * FROM posts WHERE id = ?", p.id));
}

// ---- public ----
router.get("/public/posts", wrap(async (req, res) => {
  const posts = (await all("SELECT * FROM posts WHERE visibility != 'Private' ORDER BY date DESC")).map(toPost).filter(isLive);
  const { category } = req.query;
  res.json(category ? posts.filter((p) => p.category === category) : posts);
}));

router.get("/public/posts/:slug", wrap(async (req, res) => {
  const post = toPost(await one("SELECT * FROM posts WHERE slug = ?", req.params.slug));
  if (!post || !isLive(post) || post.visibility === "Private") return res.status(404).json({ error: "Post not found." });
  await run("UPDATE posts SET views = views + 1 WHERE id = ?", post.id);
  res.json(post);
}));

// ---- admin ----
router.post("/posts", requireAdmin, wrap(async (req, res) => res.status(201).json(await save(null, req.body))));

router.put("/posts/:id", requireAdmin, wrap(async (req, res) => {
  const row = toPost(await one("SELECT * FROM posts WHERE id = ?", req.params.id));
  if (!row) return res.status(404).json({ error: "Post not found." });
  res.json(await save(row, req.body));
}));

router.delete("/posts/:id", requireAdmin, wrap(async (req, res) => {
  const { rowsAffected } = await run("DELETE FROM posts WHERE id = ?", req.params.id);
  if (!rowsAffected) return res.status(404).json({ error: "Post not found." });
  res.json({ ok: true });
}));

export default router;
