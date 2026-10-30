import { Router } from "express";
import { createSession, endSessions, requireAdmin } from "../auth.js";
import { db } from "../db.js";
import { hashPassword, rateLimit, str, verifyPassword } from "../util.js";

const router = Router();

router.post("/login", rateLimit(8), (req, res) => {
  const email = str(req.body.email).toLowerCase().trim();
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !verifyPassword(str(req.body.password, 200), user.pass)) return res.status(401).json({ error: "Wrong email or password." });
  createSession(res, user.email);
  res.json({ name: user.name, email: user.email });
});

router.get("/me", requireAdmin, (req, res) => res.json({ name: req.user.name, email: req.user.email, role: req.user.role }));

router.post("/logout", requireAdmin, (req, res) => {
  endSessions(res, req.user.email);
  res.json({ ok: true });
});

router.post("/password", requireAdmin, (req, res) => {
  if (!verifyPassword(str(req.body.current, 200), req.user.pass)) return res.status(400).json({ error: "Current password is wrong." });
  const next = str(req.body.next, 200);
  if (next.length < 10) return res.status(400).json({ error: "Use at least 10 characters." });
  db.prepare("UPDATE users SET pass = ? WHERE email = ?").run(hashPassword(next), req.user.email);
  res.json({ ok: true });
});

export default router;
