import { Router } from "express";
import { createSession, endSessions, requireAdmin } from "../auth.js";
import { col } from "../db.js";
import { passwordChanged } from "../emails/templates.js";
import { sendSafely } from "../services/mailer.js";
import { hashPassword, rateLimit, str, verifyPassword, wrap } from "../util.js";

const router = Router();

router.post("/login", rateLimit(8), wrap(async (req, res) => {
  const email = str(req.body.email).toLowerCase().trim();
  const user = await col("users").findOne({ email });
  if (!user || !verifyPassword(str(req.body.password, 200), user.pass)) return res.status(401).json({ error: "Wrong email or password." });
  await createSession(res, user.email);
  res.json({ name: user.name, email: user.email });
}));

router.get("/me", requireAdmin, (req, res) => res.json({ name: req.user.name, email: req.user.email, role: req.user.role }));

router.post("/logout", requireAdmin, wrap(async (req, res) => {
  await endSessions(res, req.user.email);
  res.json({ ok: true });
}));

router.post("/password", requireAdmin, wrap(async (req, res) => {
  if (!verifyPassword(str(req.body.current, 200), req.user.pass)) return res.status(400).json({ error: "Current password is wrong." });
  const next = str(req.body.next, 200);
  if (next.length < 10) return res.status(400).json({ error: "Use at least 10 characters." });
  await col("users").updateOne({ email: req.user.email }, { $set: { pass: hashPassword(next) } });
  await sendSafely({ to: req.user.email, ...passwordChanged({ name: req.user.name }) });
  res.json({ ok: true });
}));

export default router;
