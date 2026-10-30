// Database: Turso / libSQL (SQLite-compatible).
// - On Vercel: set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (a hosted database; Vercel has no permanent disk).
// - Locally: with no TURSO_DATABASE_URL, a file at data/aurum.db is used.
import fs from "node:fs";
import { createClient } from "@libsql/client";
import { hashPassword, randomId, slugify } from "./util.js";

function connect() {
  if (process.env.TURSO_DATABASE_URL) {
    return createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  if (process.env.VERCEL) throw new Error("TURSO_DATABASE_URL is required on Vercel.");
  fs.mkdirSync("data", { recursive: true });
  return createClient({ url: "file:data/aurum.db" });
}

const client = connect();

/** All rows. */
export const all = async (sql, ...args) => (await client.execute({ sql, args })).rows.map((r) => ({ ...r }));
/** First row or undefined. */
export const one = async (sql, ...args) => (await all(sql, ...args))[0];
/** Run a write; returns { rowsAffected }. */
export const run = async (sql, ...args) => client.execute({ sql, args });

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'Administrator', pass TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, subtitle TEXT DEFAULT '', body TEXT DEFAULT '',
    category TEXT, author TEXT, label TEXT, status TEXT NOT NULL DEFAULT 'Draft', date TEXT, visibility TEXT DEFAULT 'Public',
    tags TEXT DEFAULT '[]', featured INTEGER DEFAULT 0, newsletter INTEGER DEFAULT 0, breaking INTEGER DEFAULT 0,
    image TEXT, imageAlt TEXT, metaTitle TEXT, metaDesc TEXT, mins INTEGER DEFAULT 1, views INTEGER DEFAULT 0, updated INTEGER)`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, name TEXT, email TEXT, category TEXT, subject TEXT, message TEXT, note TEXT,
    status TEXT DEFAULT 'New', at INTEGER, replies TEXT NOT NULL DEFAULT '[]')`,
  `CREATE TABLE IF NOT EXISTS subscribers (email TEXT PRIMARY KEY, source TEXT, at INTEGER, status TEXT NOT NULL DEFAULT 'Pending', token TEXT)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS subscribers_token ON subscribers(token)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];

async function migrate() {
  for (const sql of SCHEMA) await run(sql);

  // Columns added after the first release
  const cols = async (table) => (await all(`PRAGMA table_info(${table})`)).map((c) => c.name);
  if (!(await cols("subscribers")).includes("status")) await run("ALTER TABLE subscribers ADD COLUMN status TEXT NOT NULL DEFAULT 'Confirmed'");
  if (!(await cols("subscribers")).includes("token")) await run("ALTER TABLE subscribers ADD COLUMN token TEXT");
  if (!(await cols("messages")).includes("replies")) await run("ALTER TABLE messages ADD COLUMN replies TEXT NOT NULL DEFAULT '[]'");

  if (!(await one("SELECT 1 AS x FROM users"))) await seed();
}

async function seed() {
  const email = (process.env.ADMIN_EMAIL || "admin@aurum.local").toLowerCase();
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    if (process.env.VERCEL) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD before the first deploy.");
    password = randomId(9);
    fs.writeFileSync("data/first-login.txt", `Admin login\nEmail: ${email}\nPassword: ${password}\nChange it after signing in, then delete this file.\n`);
    console.log("Created admin account — login saved in data/first-login.txt");
  }
  await run("INSERT INTO users (email, name, pass) VALUES (?, ?, ?)", email, "Site Admin", hashPassword(password));

  const samples = [
    ["Why central banks keep buying gold — and what it means for price floors", "Gold Analysis", "Sarah Mitchell", "Official-sector demand has reshaped gold's downside. We quantify the effect.", "2026-10-30"],
    ["EUR/USD: policy divergence returns as ECB signals faster easing", "Forex Trading", "James Lowe", "Rate expectations are pulling the euro toward the bottom of its range.", "2026-10-29"],
    ["Spot Bitcoin ETF flows: reading the signal through the noise", "Bitcoin & Crypto", "Daniel Kim", "Daily flow data is volatile. A rolling view tells a clearer story.", "2026-10-28"],
    ["Position sizing 101: the 1% rule and why it keeps traders solvent", "Trading Education", "Priya Nair", "A step-by-step guide to sizing trades around risk, not conviction.", "2026-10-25"],
  ];
  for (const [title, category, author, excerpt, date] of samples) {
    await run(
      "INSERT INTO posts (id, slug, title, subtitle, body, category, author, label, status, date, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Published', ?, ?)",
      randomId(), slugify(title), title, excerpt, `<h2>Summary</h2><p>${excerpt}</p>`, category, author,
      category === "Trading Education" ? "Education" : "Analysis / Opinion", date, Date.now()
    );
  }
}

/** Resolves once the schema exists. Every request waits on this (instant after the first). */
export const ready = migrate();

// ---- key/value settings ----
export async function getSetting(key, fallback) {
  const row = await one("SELECT value FROM settings WHERE key = ?", key);
  return row ? JSON.parse(row.value) : fallback;
}
export const setSetting = (key, value) => run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", key, JSON.stringify(value));
