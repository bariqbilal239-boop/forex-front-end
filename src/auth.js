import crypto from "node:crypto";
import { db } from "./db.js";

export const SESSION_MS = 8 * 3600_000;
const COOKIE = "aurum_sid";

const tokenFrom = (req) => (req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]+)`))?.[1];

export function createSession(res, email) {
  const token = crypto.randomBytes(24).toString("hex");
  db.prepare("INSERT INTO sessions (token, email, expires) VALUES (?, ?, ?)").run(token, email, Date.now() + SESSION_MS);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`);
}

export function endSessions(res, email) {
  db.prepare("DELETE FROM sessions WHERE email = ?").run(email);
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0`);
}

/** Requires a signed-in admin. Write requests must also send `X-Requested-With: aurum` (CSRF guard). */
export function requireAdmin(req, res, next) {
  db.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
  const token = tokenFrom(req);
  const user = token && db.prepare("SELECT u.email, u.name, u.role, u.pass FROM sessions s JOIN users u ON u.email = s.email WHERE s.token = ?").get(token);
  if (!user) return res.status(401).json({ error: "Sign in required." });
  if (req.method !== "GET" && req.get("X-Requested-With") !== "aurum") return res.status(403).json({ error: "Bad request origin." });
  req.user = user;
  next();
}
