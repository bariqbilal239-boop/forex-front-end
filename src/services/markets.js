// Market prices from Twelve Data (https://twelvedata.com) — one API for gold, silver, Forex and crypto.
// Serverless-friendly: no timers. Prices are cached in the database and refreshed on the first request
// after they go stale, so the provider is called at most once per MARKET_REFRESH_MINUTES.
// Without TWELVE_DATA_API_KEY the API returns sample values, clearly marked mode: "sample".
import { getSetting, setSetting } from "../db.js";

const SYMBOLS = [
  { symbol: "XAU/USD", name: "Gold Spot" },
  { symbol: "XAG/USD", name: "Silver Spot" },
  { symbol: "EUR/USD", name: "Euro / Dollar" },
  { symbol: "GBP/USD", name: "Pound / Dollar" },
  { symbol: "USD/JPY", name: "Dollar / Yen" },
  { symbol: "BTC/USD", name: "Bitcoin" },
  { symbol: "ETH/USD", name: "Ethereum" },
];
// USD → local currency, for the gold calculator
const FX = ["USD/PKR", "USD/INR", "USD/AED", "USD/EUR"];
const FX_REFRESH_MS = 6 * 3600_000;
const CACHE_KEY = "markets_cache";

const SAMPLE = {
  mode: "sample",
  source: "Illustrative sample data",
  updated: null,
  quotes: [
    { symbol: "XAU/USD", name: "Gold Spot", price: 2748.3, change: 0.67, high: 2756.1, low: 2731.4 },
    { symbol: "XAG/USD", name: "Silver Spot", price: 32.84, change: 1.12, high: 33.02, low: 32.41 },
    { symbol: "EUR/USD", name: "Euro / Dollar", price: 1.0832, change: -0.21, high: 1.0861, low: 1.0815 },
    { symbol: "GBP/USD", name: "Pound / Dollar", price: 1.3021, change: 0.08, high: 1.3044, low: 1.2992 },
    { symbol: "USD/JPY", name: "Dollar / Yen", price: 152.31, change: 0.41, high: 152.6, low: 151.7 },
    { symbol: "BTC/USD", name: "Bitcoin", price: 71420, change: 2.14, high: 71980, low: 69850 },
    { symbol: "ETH/USD", name: "Ethereum", price: 2634, change: -1.08, high: 2671, low: 2605 },
  ],
  fx: { USD: 1, PKR: 278.5, INR: 83.9, AED: 3.6725, EUR: 0.92 },
};

const BASE = "https://api.twelvedata.com";
const refreshMs = () => Math.max(5, Number(process.env.MARKET_REFRESH_MINUTES) || 20) * 60_000;
const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  const json = await res.json();
  if (!res.ok || json.status === "error") throw new Error(json.message || `HTTP ${res.status}`);
  return json;
}

async function fetchQuotes(key) {
  const data = await fetchJson(`${BASE}/quote?symbol=${encodeURIComponent(SYMBOLS.map((s) => s.symbol).join(","))}&apikey=${key}`);
  const quotes = SYMBOLS.map(({ symbol, name }) => {
    const q = data[symbol];
    if (!q || q.status === "error" || q.close === undefined) return null;
    return { symbol, name, price: num(q.close), change: num(q.percent_change) ?? 0, high: num(q.high), low: num(q.low) };
  }).filter(Boolean);
  if (!quotes.length) throw new Error("Provider returned no quotes");
  return quotes;
}

async function fetchFx(key) {
  const data = await fetchJson(`${BASE}/exchange_rate?symbol=${encodeURIComponent(FX.join(","))}&apikey=${key}`);
  const fx = { ...SAMPLE.fx };
  for (const pair of FX) {
    const rate = num(data[pair]?.rate);
    if (rate) fx[pair.split("/")[1]] = rate;
  }
  return fx;
}

let refreshing = null; // de-duplicates concurrent refreshes within one instance

async function refresh(key, cache) {
  const now = Date.now();
  const next = { ...cache, error: null };
  try {
    next.quotes = await fetchQuotes(key);
    next.updated = new Date(now).toISOString();
    next.fetchedAt = now;
  } catch (err) {
    next.error = err.message;
    next.fetchedAt = now; // back off until the next interval instead of retrying every request
    console.error("[markets] quote refresh failed:", err.message);
  }
  if (!cache.fxAt || now - cache.fxAt > FX_REFRESH_MS) {
    try {
      next.fx = await fetchFx(key);
      next.fxAt = now;
    } catch (err) {
      console.error("[markets] FX refresh failed:", err.message);
    }
  }
  await setSetting(CACHE_KEY, next);
  return next;
}

async function load() {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) return { ...SAMPLE, configured: false, error: null };

  let cache = await getSetting(CACHE_KEY, {});
  if (!cache.fetchedAt || Date.now() - cache.fetchedAt > refreshMs()) {
    refreshing ??= refresh(key, cache).finally(() => (refreshing = null));
    cache = await refreshing;
  }
  if (!cache.quotes?.length) return { ...SAMPLE, configured: true, error: cache.error };
  return {
    mode: "delayed",
    source: "Twelve Data",
    updated: cache.updated,
    quotes: cache.quotes,
    fx: cache.fx || SAMPLE.fx,
    configured: true,
    error: cache.error,
  };
}

/** Public shape used by the website. */
export async function getMarkets() {
  const { mode, source, updated, quotes, fx } = await load();
  return { mode, source, updated, quotes, fx };
}

/** Admin view, including whether a key is set and the last error. */
export const marketStatus = () => load();
