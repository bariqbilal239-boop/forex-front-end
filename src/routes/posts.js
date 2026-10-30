import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { db } from "../db.js";
import { cleanHtml, randomId, slugify, str } from "../util.js";

const router = Router();

const TEXT_FIELDS = ["title", "subtitle", "category", "author", "label", "status", "date", "visibility", "image", "imageAlt", "metaTitle", "metaDesc"];
const FLAGS = ["featured", "newsletter", "breaking"];
const STATUSES = ["Draft", "In review", "Scheduled", "Published"];

/** DB row → API object */
export const toPost = (r) =>
  r && { ...r, tags: JSON.parse(r.tags || "[]"), featured: !!r.featured, newsletter: !!r.newsletter, breaking: !!r.breaking, excerpt: r.subtitle };

const isLive = (p) => p.status === "Published" || (p.status === "Scheduled" && p.date && new Date(p.date) <= new Date());

function uniqueSlug(base, id) {
  let slug = slugify(base);
  while (db.prepare("SELECT 1 FROM posts WHERE slug = ? AND id != ?").get(slug, id)) slug = `${slugify(base)}-${randomId(2)}`;
  return slug;
}

function save(existing, body) {
  const p = existing ? { ...existing } : { id: randomId(), title: "Untitled post", status: "Draft", views: 0, tags: [] };
  for (const k of TEXT_FIELDS) if (body[k] !== undefined) p[k] = str(body[k], k === "metaDesc" ? 400 : 300);
  for (const k of FLAGS) if (body[k] !== undefined) p[k] = !!body[k];
  if (!STATUSES.includes(p.status)) p.status = "Draft";
  if (Array.isArray(body.tags)) p.tags = body.tags.slice(0, 20).map((t) => str(t, 40));
  if (body.body !== undefined) {
    p.body = cleanHtml(body.body).slice(0, 500_000);
    p.mins = Math.max(1, Math.round(p.body.replace(/<[^>]+>/g, " ").split(/\s+/).length / 220));
  }
  p.slug = uniqueSlug(body.slug || p.slug || p.title, p.id);
  p.updated = Date.now();

  const row = { ...p, tags: JSON.stringify(p.tags || []), featured: +!!p.featured, newsletter: +!!p.newsletter, breaking: +!!p.breaking };
  delete row.excerpt;
  const cols = Object.keys(row);
  db.prepare(`INSERT OR REPLACE INTO posts (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...cols.map((c) => row[c] ?? null));
  return toPost(db.prepare("SELECT * FROM posts WHERE id = ?").get(p.id));
}

// ---- public ----
router.get("/public/posts", (req, res) => {
  const posts = db.prepare("SELECT * FROM posts WHERE visibility != 'Private' ORDER BY date DESC").all().map(toPost).filter(isLive);
  const { category } = req.query;
  res.json(category ? posts.filter((p) => p.category === category) : posts);
});

router.get("/public/posts/:slug", (req, res) => {
  const post = toPost(db.prepare("SELECT * FROM posts WHERE slug = ?").get(req.params.slug));
  if (!post || !isLive(post) || post.visibility === "Private") return res.status(404).json({ error: "Post not found." });
  db.prepare("UPDATE posts SET views = views + 1 WHERE id = ?").run(post.id);
  res.json(post);
});

// ---- admin ----
router.post("/posts", requireAdmin, (req, res) => res.status(201).json(save(null, req.body)));

router.put("/posts/:id", requireAdmin, (req, res) => {
  const row = toPost(db.prepare("SELECT * FROM posts WHERE id = ?").get(req.params.id));
  if (!row) return res.status(404).json({ error: "Post not found." });
  res.json(save(row, req.body));
});

router.delete("/posts/:id", requireAdmin, (req, res) => {
  const { changes } = db.prepare("DELETE FROM posts WHERE id = ?").run(req.params.id);
  if (!changes) return res.status(404).json({ error: "Post not found." });
  res.json({ ok: true });
});

export default router;
