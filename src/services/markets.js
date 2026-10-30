// Market prices from Twelve Data (https://twelvedata.com) — one API for gold, silver, Forex and crypto.
// Quotes are fetched on a timer and cached, so website traffic never touches the provider directly.
// Without TWELVE_DATA_API_KEY the API returns sample values, clearly marked mode: "sample".

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

const SAMPLE = {
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

const state = {
  mode: "sample", // "sample" | "delayed"
  source: "Illustrative sample data",
  updated: null,
  quotes: SAMPLE.quotes,
  fx: SAMPLE.fx,
  error: null,
};

const BASE = "https://api.twelvedata.com";

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const json = await res.json();
  if (!res.ok || json.status === "error") throw new Error(json.message || `HTTP ${res.status}`);
  return json;
}

const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));

async function refreshQuotes(key) {
  const data = await fetchJson(`${BASE}/quote?symbol=${encodeURIComponent(SYMBOLS.map((s) => s.symbol).join(","))}&apikey=${key}`);
  const quotes = SYMBOLS.map(({ symbol, name }) => {
    const q = data[symbol];
    if (!q || q.status === "error" || q.close === undefined) return null;
    return { symbol, name, price: num(q.close), change: num(q.percent_change) ?? 0, high: num(q.high), low: num(q.low) };
  }).filter(Boolean);
  if (!quotes.length) throw new Error("Provider returned no quotes");
  Object.assign(state, { quotes, mode: "delayed", source: "Twelve Data", updated: new Date().toISOString(), error: null });
}

async function refreshFx(key) {
  const data = await fetchJson(`${BASE}/exchange_rate?symbol=${encodeURIComponent(FX.join(","))}&apikey=${key}`);
  const fx = { USD: 1 };
  for (const pair of FX) {
    const rate = num(data[pair]?.rate);
    if (rate) fx[pair.split("/")[1]] = rate;
  }
  state.fx = { ...SAMPLE.fx, ...fx };
}

/** Starts the refresh timers. Free Twelve Data plans allow ~800 requests/day; the default 20-minute interval uses ~600. */
export function startMarketFeed() {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) {
    console.log("[markets] TWELVE_DATA_API_KEY not set — serving sample prices (labelled as samples).");
    return;
  }
  const minutes = Math.max(5, Number(process.env.MARKET_REFRESH_MINUTES) || 20);
  const runQuotes = () =>
    refreshQuotes(key).catch((err) => {
      state.error = err.message;
      console.error("[markets] quote refresh failed:", err.message);
    });
  const runFx = () => refreshFx(key).catch((err) => console.error("[markets] FX refresh failed:", err.message));

  runQuotes();
  setTimeout(runFx, 65_000); // stagger to stay under the per-minute limit
  setInterval(runQuotes, minutes * 60_000).unref();
  setInterval(runFx, 6 * 3600_000).unref();
}

export function getMarkets() {
  const { mode, source, updated, quotes, fx } = state;
  return { mode, source, updated, quotes, fx };
}

export const marketStatus = () => ({ ...getMarkets(), error: state.error, configured: Boolean(process.env.TWELVE_DATA_API_KEY) });
