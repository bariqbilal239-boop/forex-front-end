import crypto from "node:crypto";
import { col } from "./db.js";

export const SESSION_MS = 8 * 3600_000;
const COOKIE = "aurum_sid";

const tokenFrom = (req) => (req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]+)`))?.[1];

export async function createSession(res, email) {
  const token = crypto.randomBytes(24).toString("hex");
  await col("sessions").insertOne({ token, email, expiresAt: new Date(Date.now() + SESSION_MS) });
  const secure = process.env.NODE_ENV === "production" || process.env.VERCEL ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`);
}

export async function endSessions(res, email) {
  await col("sessions").deleteMany({ email });
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0`);
}

/** Requires a signed-in admin. Write requests must also send `X-Requested-With: aurum` (CSRF guard). */
export async function requireAdmin(req, res, next) {
  try {
    const token = tokenFrom(req);
    const session = token && (await col("sessions").findOne({ token, expiresAt: { $gt: new Date() } }));
    const user = session && (await col("users").findOne({ email: session.email }));
    if (!user) return res.status(401).json({ error: "Sign in required." });
    if (req.method !== "GET" && req.get("X-Requested-With") !== "aurum") return res.status(403).json({ error: "Bad request origin." });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
