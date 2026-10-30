// Contact messages and newsletter subscribers.
import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { db } from "../db.js";
import { isEmail, randomId, rateLimit, str } from "../util.js";

const router = Router();

// ---- public ----
router.post("/messages", rateLimit(10), (req, res) => {
  const b = req.body;
  if (!str(b.name).trim() || !isEmail(b.email) || str(b.message, 5000).trim().length < 20) {
    return res.status(400).json({ error: "Please complete all fields." });
  }
  db.prepare("INSERT INTO messages (id, name, email, category, subject, message, at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    randomId(), str(b.name, 120), str(b.email, 200), str(b.category, 80), str(b.subject, 200), str(b.message, 5000), Date.now()
  );
  res.status(201).json({ ok: true });
});

router.post("/subscribers", rateLimit(10), (req, res) => {
  if (!isEmail(req.body.email)) return res.status(400).json({ error: "Invalid email." });
  db.prepare("INSERT OR IGNORE INTO subscribers (email, source, at) VALUES (?, ?, ?)").run(str(req.body.email, 200).toLowerCase(), str(req.body.source, 40), Date.now());
  res.status(201).json({ ok: true });
});

// ---- admin ----
router.put("/messages/:id", requireAdmin, (req, res) => {
  const msg = db.prepare("SELECT * FROM messages WHERE id = ?").get(req.params.id);
  if (!msg) return res.status(404).json({ error: "Not found." });
  const status = req.body.status ? str(req.body.status, 20) : msg.status;
  const note = req.body.note !== undefined ? str(req.body.note, 4000) : msg.note;
  db.prepare("UPDATE messages SET status = ?, note = ? WHERE id = ?").run(status, note, msg.id);
  res.json({ ...msg, status, note });
});

router.delete("/messages/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM messages WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

router.delete("/subscribers/:email", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM subscribers WHERE email = ?").run(req.params.email);
  res.json({ ok: true });
});

export default router;
