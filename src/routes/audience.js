// Contact messages, newsletter subscribers (double opt-in) and email campaigns.
import crypto from "node:crypto";
import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { all, one, run } from "../db.js";
import * as emails from "../emails/templates.js";
import { sendEmail, sendSafely } from "../services/mailer.js";
import { isEmail, randomId, rateLimit, str, wrap } from "../util.js";

const router = Router();

const apiUrl = () => process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 5173}`;
const siteUrl = () => process.env.SITE_URL || "http://localhost:3000";
const unsubscribeUrl = (token) => `${apiUrl()}/api/subscribers/unsubscribe?token=${token}`;
const newToken = () => crypto.randomBytes(24).toString("hex");

// ---------- public: contact ----------
router.post("/messages", rateLimit(10), wrap(async (req, res) => {
  const b = req.body;
  const msg = { name: str(b.name, 120).trim(), email: str(b.email, 200).trim(), category: str(b.category, 80), subject: str(b.subject, 200).trim(), message: str(b.message, 5000).trim() };
  if (!msg.name || !isEmail(msg.email) || !msg.subject || msg.message.length < 20) return res.status(400).json({ error: "Please complete all fields." });

  await run("INSERT INTO messages (id, name, email, category, subject, message, at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    randomId(), msg.name, msg.email, msg.category, msg.subject, msg.message, Date.now());

  await Promise.all([
    sendSafely({ to: msg.email, ...emails.contactAutoReply(msg) }),
    process.env.ADMIN_NOTIFY_EMAIL &&
      sendSafely({ to: process.env.ADMIN_NOTIFY_EMAIL, replyTo: msg.email, ...emails.contactNotification({ ...msg, adminUrl: `${apiUrl()}/admin.html#inbox` }) }),
  ]);
  res.status(201).json({ ok: true });
}));

// ---------- public: newsletter (double opt-in) ----------
router.post("/subscribers", rateLimit(10), wrap(async (req, res) => {
  if (!isEmail(req.body.email)) return res.status(400).json({ error: "Invalid email." });
  const email = str(req.body.email, 200).toLowerCase().trim();
  const existing = await one("SELECT * FROM subscribers WHERE email = ?", email);
  // Same response either way, so the form can't be used to discover who is subscribed.
  if (existing?.status === "Confirmed") return res.status(201).json({ ok: true, pending: true });

  const token = newToken();
  await run("INSERT OR REPLACE INTO subscribers (email, source, at, status, token) VALUES (?, ?, ?, 'Pending', ?)", email, str(req.body.source, 40), Date.now(), token);
  await sendEmail({ to: email, ...emails.confirmSubscription({ confirmUrl: `${apiUrl()}/api/subscribers/confirm?token=${token}` }) });
  res.status(201).json({ ok: true, pending: true });
}));

router.get("/subscribers/confirm", wrap(async (req, res) => {
  const sub = await one("SELECT * FROM subscribers WHERE token = ?", str(req.query.token, 100));
  if (!sub) return res.redirect(`${siteUrl()}/newsletter?status=invalid`);
  if (sub.status !== "Confirmed") {
    await run("UPDATE subscribers SET status = 'Confirmed' WHERE email = ?", sub.email);
    await sendSafely({ to: sub.email, ...emails.welcome({ unsubscribeUrl: unsubscribeUrl(sub.token) }) });
  }
  res.redirect(`${siteUrl()}/newsletter?status=confirmed`);
}));

// GET for the link in emails; POST for one-click unsubscribe from mail clients (RFC 8058)
router.all("/subscribers/unsubscribe", wrap(async (req, res) => {
  await run("UPDATE subscribers SET status = 'Unsubscribed' WHERE token = ?", str(req.query.token, 100));
  if (req.method === "POST") return res.json({ ok: true });
  res.redirect(`${siteUrl()}/newsletter?status=unsubscribed`);
}));

// ---------- admin ----------
router.put("/messages/:id", requireAdmin, wrap(async (req, res) => {
  const msg = await one("SELECT * FROM messages WHERE id = ?", req.params.id);
  if (!msg) return res.status(404).json({ error: "Not found." });
  const status = req.body.status ? str(req.body.status, 20) : msg.status;
  const note = req.body.note !== undefined ? str(req.body.note, 4000) : msg.note;
  await run("UPDATE messages SET status = ?, note = ? WHERE id = ?", status, note, msg.id);
  res.json({ ...msg, status, note });
}));

router.post("/messages/:id/reply", requireAdmin, wrap(async (req, res) => {
  const msg = await one("SELECT * FROM messages WHERE id = ?", req.params.id);
  if (!msg) return res.status(404).json({ error: "Not found." });
  const reply = str(req.body.reply, 10000).trim();
  if (!reply) return res.status(400).json({ error: "Write a reply first." });

  await sendEmail({ to: msg.email, ...emails.contactReply({ name: msg.name, subject: msg.subject, reply, staffName: req.user.name }) });
  const replies = JSON.stringify([...JSON.parse(msg.replies || "[]"), { by: req.user.name, text: reply, at: Date.now() }]);
  await run("UPDATE messages SET replies = ?, status = 'Resolved' WHERE id = ?", replies, msg.id);
  res.json({ ...msg, replies, status: "Resolved" });
}));

router.delete("/messages/:id", requireAdmin, wrap(async (req, res) => {
  await run("DELETE FROM messages WHERE id = ?", req.params.id);
  res.json({ ok: true });
}));

router.delete("/subscribers/:email", requireAdmin, wrap(async (req, res) => {
  await run("DELETE FROM subscribers WHERE email = ?", req.params.email);
  res.json({ ok: true });
}));

/** Send a campaign to every confirmed subscriber. `test: true` sends only to the signed-in admin. */
router.post("/campaigns", requireAdmin, wrap(async (req, res) => {
  const subject = str(req.body.subject, 200).trim();
  const body = str(req.body.body, 20000).trim();
  if (!subject || !body) return res.status(400).json({ error: "Add a subject and message." });

  const recipients = req.body.test
    ? [{ email: req.user.email, token: "test" }]
    : await all("SELECT email, token FROM subscribers WHERE status = 'Confirmed'");

  let sent = 0;
  const failed = [];
  for (const r of recipients) {
    const unsub = unsubscribeUrl(r.token);
    try {
      await sendEmail({
        to: r.email,
        ...emails.campaign({ subject, body, unsubscribeUrl: unsub }),
        headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      });
      sent++;
    } catch (err) {
      failed.push(r.email);
      console.error(`[email] campaign to ${r.email} failed:`, err.message);
    }
  }
  res.json({ sent, failed: failed.length });
}));

// Preview any template in the browser: /api/emails/preview/welcome (admin only)
router.get("/emails/preview/:name", requireAdmin, (req, res) => {
  const make = emails.previews[req.params.name];
  if (!make) return res.status(404).json({ error: `Unknown template. Try: ${Object.keys(emails.previews).join(", ")}` });
  res.type("html").send(make().html);
});

export default router;
