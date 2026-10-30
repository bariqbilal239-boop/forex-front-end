import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { col, NO_ID } from "../db.js";
import { cleanHtml, randomId, slugify, str, wrap } from "../util.js";

const router = Router();

const TEXT_FIELDS = ["title", "subtitle", "category", "author", "label", "status", "date", "visibility", "image", "imageAlt", "metaTitle", "metaDesc"];
const FLAGS = ["featured", "newsletter", "breaking"];
const STATUSES = ["Draft", "In review", "Scheduled", "Published"];

/** Stored document → API object */
export const toPost = (p) => p && { ...p, tags: p.tags || [], excerpt: p.subtitle };

const isLive = (p) => p.status === "Published" || (p.status === "Scheduled" && p.date && new Date(p.date) <= new Date());

async function uniqueSlug(base, id) {
  let slug = slugify(base);
  while (await col("posts").findOne({ slug, id: { $ne: id } })) slug = `${slugify(base)}-${randomId(2)}`;
  return slug;
}

async function save(existing, body) {
  const p = existing ? { ...existing } : { id: randomId(), title: "Untitled post", status: "Draft", views: 0, tags: [], mins: 1, visibility: "Public" };
  delete p.excerpt;
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

  await col("posts").replaceOne({ id: p.id }, p, { upsert: true });
  return toPost(await col("posts").findOne({ id: p.id }, NO_ID));
}

// ---- public ----
router.get("/public/posts", wrap(async (req, res) => {
  const filter = { visibility: { $ne: "Private" }, status: { $in: ["Published", "Scheduled"] } };
  if (req.query.category) filter.category = str(req.query.category, 80);
  const posts = await col("posts").find(filter, NO_ID).sort({ date: -1 }).toArray();
  res.json(posts.map(toPost).filter(isLive));
}));

router.get("/public/posts/:slug", wrap(async (req, res) => {
  const post = toPost(await col("posts").findOne({ slug: str(req.params.slug, 120) }, NO_ID));
  if (!post || !isLive(post) || post.visibility === "Private") return res.status(404).json({ error: "Post not found." });
  await col("posts").updateOne({ id: post.id }, { $inc: { views: 1 } });
  res.json(post);
}));

// ---- admin ----
router.post("/posts", requireAdmin, wrap(async (req, res) => res.status(201).json(await save(null, req.body))));

router.put("/posts/:id", requireAdmin, wrap(async (req, res) => {
  const existing = await col("posts").findOne({ id: str(req.params.id, 40) }, NO_ID);
  if (!existing) return res.status(404).json({ error: "Post not found." });
  res.json(await save(existing, req.body));
}));

router.delete("/posts/:id", requireAdmin, wrap(async (req, res) => {
  const { deletedCount } = await col("posts").deleteOne({ id: str(req.params.id, 40) });
  if (!deletedCount) return res.status(404).json({ error: "Post not found." });
  res.json({ ok: true });
}));

export default router;
