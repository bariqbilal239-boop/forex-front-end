import crypto from "node:crypto";

export const randomId = (bytes = 6) => crypto.randomBytes(bytes).toString(bytes > 6 ? "base64url" : "hex");

export const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || randomId();

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const a = Buffer.from(hash, "hex");
  const b = crypto.scryptSync(password, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const str = (v, max = 500) => String(v ?? "").slice(0, max);
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v));

// Admin-authored HTML: remove scripts, embeds, inline handlers and javascript: URLs.
export const cleanHtml = (html) =>
  String(html || "")
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|iframe|object|embed)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');

/** Simple per-IP rate limiter: `limit(max, windowMs)` returns Express middleware. */
export function rateLimit(max, windowMs = 10 * 60_000) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const list = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
    list.push(now);
    hits.set(req.ip, list);
    if (list.length > max) return res.status(429).json({ error: "Too many requests. Try again later." });
    next();
  };
}

/** Wraps async route handlers so thrown errors reach the error middleware. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
