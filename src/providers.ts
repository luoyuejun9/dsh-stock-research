import type { Market, ProviderErrorShape, ProviderName, StockIdentity } from "./types.js";
import { redact } from "./security.js";

export class ProviderError extends Error {
  readonly detail: ProviderErrorShape;
  constructor(detail: ProviderErrorShape) { super(`${detail.provider}/${detail.endpoint}: ${detail.message}`); this.detail = detail; }
}

export interface DataProvider {
  readonly name: ProviderName;
  enabled(): boolean;
  request(endpoint: string, params: Record<string, string | number | undefined>): Promise<unknown>;
}

async function jsonResponse(response: Response, provider: ProviderName, endpoint: string): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) throw new ProviderError({ provider, endpoint, status: response.status, message: redact(text).slice(0, 500) || response.statusText });
  try { return JSON.parse(text) as unknown; }
  catch { throw new ProviderError({ provider, endpoint, message: `expected JSON, got ${redact(text).slice(0, 180)}` }); }
}

export class TushareProvider implements DataProvider {
  readonly name = "tushare" as const;
  constructor(private readonly token = process.env.TUSHARE_TOKEN, private readonly baseUrl = "https://api.tushare.pro", private readonly timeoutMs = 15_000) {}
  enabled(): boolean { return Boolean(this.token); }
  async request(endpoint: string, params: Record<string, string | number | undefined>): Promise<unknown> {
    if (!this.token) throw new ProviderError({ provider: this.name, endpoint, message: "TUSHARE_TOKEN is not configured" });
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.baseUrl, { method: "POST", signal: controller.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ api_name: endpoint, token: this.token, params }) });
      const payload = await jsonResponse(response, this.name, endpoint) as { code?: number; msg?: string; data?: unknown };
      if (payload.code && payload.code !== 0) throw new ProviderError({ provider: this.name, endpoint, message: payload.msg ?? `API error ${payload.code}` });
      return payload.data ?? payload;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError({ provider: this.name, endpoint, message: error instanceof Error && error.name === "AbortError" ? "request timed out" : String(error) });
    } finally { clearTimeout(timer); }
  }
}

export class AlphaVantageProvider implements DataProvider {
  readonly name = "alpha_vantage" as const;
  constructor(private readonly key = process.env.ALPHAVANTAGE_API_KEY, private readonly baseUrl = "https://www.alphavantage.co/query", private readonly timeoutMs = 15_000) {}
  enabled(): boolean { return Boolean(this.key); }
  async request(endpoint: string, params: Record<string, string | number | undefined>): Promise<unknown> {
    if (!this.key) throw new ProviderError({ provider: this.name, endpoint, message: "ALPHAVANTAGE_API_KEY is not configured" });
    const url = new URL(this.baseUrl);
    url.searchParams.set("function", endpoint); url.searchParams.set("apikey", this.key);
    for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const payload = await jsonResponse(await fetch(url, { signal: controller.signal }), this.name, endpoint) as Record<string, unknown>;
      const message = typeof payload["Error Message"] === "string" ? payload["Error Message"] : typeof payload.Note === "string" ? payload.Note : undefined;
      if (message) throw new ProviderError({ provider: this.name, endpoint, message: message.slice(0, 500) });
      return payload;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError({ provider: this.name, endpoint, message: error instanceof Error && error.name === "AbortError" ? "request timed out" : String(error) });
    } finally { clearTimeout(timer); }
  }
}

export function resolveSymbol(input: string, requested: "auto" | Market = "auto"): StockIdentity {
  const raw = input.trim().toUpperCase();
  if (!raw) throw new Error("a stock symbol is required");
  const inferred: Market | undefined = raw.endsWith(".SH") || raw.endsWith(".SZ") || raw.endsWith(".BJ") ? "CN" : raw.endsWith(".HK") ? "HK" : /^[A-Z][A-Z.\-]{0,9}$/u.test(raw) ? "US" : undefined;
  const market = requested === "auto" ? inferred : requested;
  if (!market) throw new Error("cannot infer market; use a normalized code or --market cn|hk|us");
  if (market === "CN") {
    if (!/^\d{6}\.(SH|SZ|BJ)$/u.test(raw)) throw new Error("China symbols must use 600519.SH, 000001.SZ, or 430047.BJ format");
    return { symbol: raw, displaySymbol: raw, market, exchange: raw.slice(-2) === "SH" ? "SSE" : raw.slice(-2) === "SZ" ? "SZSE" : "BSE", currency: "CNY" };
  }
  if (market === "HK") {
    const symbol = raw.endsWith(".HK") ? raw : `${raw.padStart(5, "0")}.HK`;
    if (!/^\d{5}\.HK$/u.test(symbol)) throw new Error("Hong Kong symbols must use 00700.HK format");
    return { symbol, displaySymbol: symbol, market, exchange: "HKEX", currency: "HKD" };
  }
  if (!/^[A-Z][A-Z.\-]{0,9}$/u.test(raw)) throw new Error("US symbols must use an exchange ticker such as AAPL");
  return { symbol: raw, displaySymbol: raw, market, exchange: "US", currency: "USD" };
}

export function tushareEndpoints(market: Market): { prices: string; financials: string; valuation: string; events: string } {
  if (market === "CN") return { prices: "daily", financials: "fina_indicator", valuation: "daily_basic", events: "anns_d" };
  if (market === "HK") return { prices: "hk_daily", financials: "hk_fina_indicator", valuation: "hk_daily", events: "anns_d" };
  return { prices: "us_daily", financials: "us_fina_indicator", valuation: "us_daily", events: "anns_d" };
}
