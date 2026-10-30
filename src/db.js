// Database: MongoDB (Atlas). Set MONGODB_URI (and optionally MONGODB_DB) in .env or in Vercel.
// The client is cached on globalThis so serverless invocations reuse one connection.
import fs from "node:fs";
import { MongoClient } from "mongodb";
import { hashPassword, randomId, slugify } from "./util.js";

const DB_NAME = process.env.MONGODB_DB || "aurum";

function connect() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set. Add it to .env (local) or the Vercel project settings.");
  globalThis.__aurumMongo ??= new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 10, serverSelectionTimeoutMS: 10_000 }).connect();
  return globalThis.__aurumMongo;
}

let database;

/** A collection by name. Only call after `ready` has resolved (every /api request waits for it). */
export const col = (name) => database.collection(name);

/** Hide Mongo's internal _id from API responses. */
export const NO_ID = { projection: { _id: 0 } };

async function setup() {
  database = (await connect()).db(DB_NAME);

  await Promise.all([
    col("users").createIndex({ email: 1 }, { unique: true }),
    col("sessions").createIndex({ token: 1 }, { unique: true }),
    col("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }), // Mongo deletes expired sessions
    col("posts").createIndex({ id: 1 }, { unique: true }),
    col("posts").createIndex({ slug: 1 }, { unique: true }),
    col("posts").createIndex({ status: 1, date: -1 }),
    col("messages").createIndex({ id: 1 }, { unique: true }),
    col("messages").createIndex({ at: -1 }),
    col("subscribers").createIndex({ email: 1 }, { unique: true }),
    col("subscribers").createIndex({ token: 1 }, { unique: true, sparse: true }),
    col("settings").createIndex({ key: 1 }, { unique: true }),
  ]);

  if (!(await col("users").findOne({}))) await seed();
}

async function seed() {
  const email = (process.env.ADMIN_EMAIL || "admin@aurum.local").toLowerCase();
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    if (process.env.VERCEL) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD before the first deploy.");
    password = randomId(9);
    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync("data/first-login.txt", `Admin login\nEmail: ${email}\nPassword: ${password}\nChange it after signing in, then delete this file.\n`);
    console.log("Created admin account — login saved in data/first-login.txt");
  }
  await col("users").insertOne({ email, name: "Site Admin", role: "Administrator", pass: hashPassword(password) });

  const samples = [
    ["Why central banks keep buying gold — and what it means for price floors", "Gold Analysis", "Sarah Mitchell", "Official-sector demand has reshaped gold's downside. We quantify the effect.", "2026-10-30"],
    ["EUR/USD: policy divergence returns as ECB signals faster easing", "Forex Trading", "James Lowe", "Rate expectations are pulling the euro toward the bottom of its range.", "2026-10-29"],
    ["Spot Bitcoin ETF flows: reading the signal through the noise", "Bitcoin & Crypto", "Daniel Kim", "Daily flow data is volatile. A rolling view tells a clearer story.", "2026-10-28"],
    ["Position sizing 101: the 1% rule and why it keeps traders solvent", "Trading Education", "Priya Nair", "A step-by-step guide to sizing trades around risk, not conviction.", "2026-10-25"],
  ];
  await col("posts").insertMany(
    samples.map(([title, category, author, excerpt, date]) => ({
      id: randomId(), slug: slugify(title), title, subtitle: excerpt, body: `<h2>Summary</h2><p>${excerpt}</p>`,
      category, author, label: category === "Trading Education" ? "Education" : "Analysis / Opinion",
      status: "Published", date, visibility: "Public", tags: [], featured: false, newsletter: false, breaking: false,
      mins: 1, views: 0, updated: Date.now(),
    }))
  );
}

/** Resolves once connected and indexed. Every /api request waits on this (instant after the first). */
export const ready = setup();
ready.catch((err) => console.error("[db] setup failed:", err.message));

// ---- key/value settings ----
export async function getSetting(key, fallback) {
  const doc = await col("settings").findOne({ key });
  return doc ? doc.value : fallback;
}
export const setSetting = (key, value) => col("settings").updateOne({ key }, { $set: { value } }, { upsert: true });
