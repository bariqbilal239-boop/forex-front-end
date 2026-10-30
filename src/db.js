import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { hashPassword, randomId, slugify } from "./util.js";

const DATA_DIR = path.resolve("data");
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, "aurum.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'Administrator', pass TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE, expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, subtitle TEXT DEFAULT '', body TEXT DEFAULT '',
  category TEXT, author TEXT, label TEXT, status TEXT NOT NULL DEFAULT 'Draft', date TEXT, visibility TEXT DEFAULT 'Public',
  tags TEXT DEFAULT '[]', featured INTEGER DEFAULT 0, newsletter INTEGER DEFAULT 0, breaking INTEGER DEFAULT 0,
  image TEXT, imageAlt TEXT, metaTitle TEXT, metaDesc TEXT, mins INTEGER DEFAULT 1, views INTEGER DEFAULT 0, updated INTEGER
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, name TEXT, email TEXT, category TEXT, subject TEXT, message TEXT, note TEXT,
  status TEXT DEFAULT 'New', at INTEGER
);
CREATE TABLE IF NOT EXISTS subscribers (email TEXT PRIMARY KEY, source TEXT, at INTEGER);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

// ---- first run: admin account + sample posts ----
if (!db.prepare("SELECT 1 FROM users").get()) {
  const email = (process.env.ADMIN_EMAIL || "admin@aurum.local").toLowerCase();
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    password = randomId(9);
    fs.writeFileSync(
      path.join(DATA_DIR, "first-login.txt"),
      `Admin login\nEmail: ${email}\nPassword: ${password}\nChange it after signing in, then delete this file.\n`
    );
    console.log("Created admin account — login saved in data/first-login.txt");
  }
  db.prepare("INSERT INTO users (email, name, pass) VALUES (?, ?, ?)").run(email, "Site Admin", hashPassword(password));

  const insert = db.prepare(
    "INSERT INTO posts (id, slug, title, subtitle, body, category, author, label, status, date, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Published', ?, ?)"
  );
  const samples = [
    ["Why central banks keep buying gold — and what it means for price floors", "Gold Analysis", "Sarah Mitchell", "Official-sector demand has reshaped gold's downside. We quantify the effect.", "2026-10-30"],
    ["EUR/USD: policy divergence returns as ECB signals faster easing", "Forex Trading", "James Lowe", "Rate expectations are pulling the euro toward the bottom of its range.", "2026-10-29"],
    ["Spot Bitcoin ETF flows: reading the signal through the noise", "Bitcoin & Crypto", "Daniel Kim", "Daily flow data is volatile. A rolling view tells a clearer story.", "2026-10-28"],
    ["Position sizing 101: the 1% rule and why it keeps traders solvent", "Trading Education", "Priya Nair", "A step-by-step guide to sizing trades around risk, not conviction.", "2026-10-25"],
  ];
  for (const [title, category, author, excerpt, date] of samples) {
    insert.run(randomId(), slugify(title), title, excerpt, `<h2>Summary</h2><p>${excerpt}</p>`, category, author, category === "Trading Education" ? "Education" : "Analysis / Opinion", date, Date.now());
  }
}
