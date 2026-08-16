import path from "node:path";
import { DiskCache } from "./cache.js";
import { deriveMetrics } from "./metrics.js";
import { AlphaVantageProvider, ProviderError, TushareProvider, resolveSymbol, tushareEndpoints, type DataProvider } from "./providers.js";
import { finite, isoDate } from "./security.js";
import { RESEARCH_PACKET_API_VERSION, type CoverageGap, type EvidenceRef, type EventItem, type FinancialPeriod, type Market, type PriceBar, type ProviderName, type ResearchInput, type ResearchPacket, type StockIdentity, type StockResearchConfig, type ValuationSnapshot } from "./types.js";

const DEFAULT_CONFIG: StockResearchConfig = { root: ".dsh/stock-research", requestTimeoutMs: 15_000, maxCacheAgeHours: 6, maxAlphaRequestsPerPacket: 5 };
type Component = "prices" | "financials" | "valuation" | "events";
type Row = Record<string, unknown>;

function rows(payload: unknown): Row[] {
  if (Array.isArray(payload)) return payload.filter((item): item is Row => Boolean(item) && typeof item === "object");
  if (!payload || typeof payload !== "object") return [];
  const data = payload as { fields?: unknown; items?: unknown };
  const fields = data.fields; const items = data.items;
  if (Array.isArray(fields) && Array.isArray(items)) return items.filter(Array.isArray).map((item) => Object.fromEntries(fields.map((field, index) => [String(field), (item as unknown[])[index]])));
  return [];
}
function value(row: Row, ...keys: string[]): number | undefined { for (const key of keys) { const item = finite(row[key]); if (item !== undefined) return item; } return undefined; }
function date(row: Row, ...keys: string[]): string | undefined { for (const key of keys) { const item = isoDate(row[key]); if (item) return item; } return undefined; }
function endpointEvidence(provider: ProviderName, endpoint: string, asOf?: string): EvidenceRef { return { provider, endpoint, fetchedAt: new Date().toISOString(), ...(asOf ? { asOf } : {}) }; }

export class StockResearchService {
  readonly config: StockResearchConfig;
  private readonly cache: DiskCache;
  private readonly tushare: TushareProvider;
  private readonly alpha: AlphaVantageProvider;
  private alphaCalls = 0;

  constructor(projectRoot: string, config: Partial<StockResearchConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new DiskCache(path.resolve(projectRoot, this.config.root, "cache"));
    this.tushare = new TushareProvider(process.env.TUSHARE_TOKEN, undefined, this.config.requestTimeoutMs);
    this.alpha = new AlphaVantageProvider(process.env.ALPHAVANTAGE_API_KEY, undefined, this.config.requestTimeoutMs);
  }

  status(): Record<string, unknown> {
    return { tushare: this.tushare.enabled() ? "configured" : "missing TUSHARE_TOKEN", alphaVantage: this.alpha.enabled() ? "configured" : "missing ALPHAVANTAGE_API_KEY", marketData: "end-of-day only", cacheHours: this.config.maxCacheAgeHours, alphaRequestBudget: this.config.maxAlphaRequestsPerPacket };
  }

  async research(input: ResearchInput): Promise<ResearchPacket> {
    this.alphaCalls = 0;
    const identity = resolveSymbol(input.symbol, input.market ?? "auto");
    const gaps: CoverageGap[] = []; const evidence: EvidenceRef[] = [];
    const [prices, financials, valuation, events] = await Promise.all([
      this.component("prices", identity, input, gaps, evidence), this.component("financials", identity, input, gaps, evidence),
      this.component("valuation", identity, input, gaps, evidence), this.component("events", identity, input, gaps, evidence)
    ]);
    const usable = [prices.length > 0, financials.length > 0, Boolean(valuation), events.length > 0].filter(Boolean).length;
    return {
      apiVersion: RESEARCH_PACKET_API_VERSION, generatedAt: new Date().toISOString(), ...(input.asOf ? { requestedAsOf: input.asOf } : {}), identity,
      prices: prices as PriceBar[], financials: financials as FinancialPeriod[], ...(valuation ? { valuation: valuation as ValuationSnapshot } : {}), events: events as EventItem[],
      derived: deriveMetrics(prices as PriceBar[], financials as FinancialPeriod[]), coverage: usable >= 3 ? "complete" : usable > 0 ? "partial" : "unavailable", gaps, evidence,
      disclaimer: "For research and education only. End-of-day data can be delayed, corrected, incomplete, or subject to provider permissions. This plugin does not provide investment advice or trading instructions."
    };
  }

  private async component(component: Component, identity: StockIdentity, input: ResearchInput, gaps: CoverageGap[], evidence: EvidenceRef[]): Promise<any> {
    const primary = await this.tushareComponent(component, identity, input).catch((error) => error);
    if (!(primary instanceof Error)) { if (primary.value !== undefined) { evidence.push(primary.evidence); return primary.value; } }
    const primaryError = primary instanceof Error ? primary : undefined;
    const fallback = await this.alphaComponent(component, identity, input).catch((error) => error);
    if (!(fallback instanceof Error) && fallback.value !== undefined) { evidence.push(fallback.evidence); return fallback.value; }
    const messages = [primaryError, fallback instanceof Error ? fallback : undefined].filter(Boolean).map((error) => error instanceof Error ? error.message : String(error));
    gaps.push({ component, reason: messages.join("; ") || "no provider returned this component", ...(primaryError instanceof ProviderError ? { provider: primaryError.detail.provider } : {}) });
    return component === "valuation" ? undefined : [];
  }

  private async fromCache(provider: DataProvider, endpoint: string, params: Record<string, string | number | undefined>, refresh: boolean | undefined): Promise<unknown> {
    const key = JSON.stringify({ provider: provider.name, endpoint, params }); const maxAge = this.config.maxCacheAgeHours * 3_600_000;
    if (!refresh) { const cached = await this.cache.get<unknown>(key, maxAge); if (cached !== undefined) return cached; }
    const payload = await provider.request(endpoint, params); await this.cache.put(key, payload); return payload;
  }

  private async tushareComponent(component: Component, identity: StockIdentity, input: ResearchInput): Promise<{ value: any; evidence: EvidenceRef }> {
    if (!this.tushare.enabled()) throw new ProviderError({ provider: "tushare", endpoint: component, message: "TUSHARE_TOKEN is not configured" });
    const endpoint = tushareEndpoints(identity.market)[component];
    const payload = await this.fromCache(this.tushare, endpoint, { ts_code: identity.symbol, ...(input.asOf ? { end_date: input.asOf.replaceAll("-", "") } : {}) }, input.refresh);
    const source = endpointEvidence("tushare", endpoint, input.asOf); const data = rows(payload);
    if (component === "prices") {
      const output: PriceBar[] = [];
      for (const row of data) { const close = value(row, "close"); const day = date(row, "trade_date", "date"); if (close !== undefined && day) output.push({ date: day, close, open: value(row, "open"), high: value(row, "high"), low: value(row, "low"), volume: value(row, "vol", "volume"), source }); }
      return { evidence: source, value: output.sort((a, b) => b.date.localeCompare(a.date)) };
    }
    if (component === "financials") {
      const output: FinancialPeriod[] = [];
      for (const row of data) { const periodEnd = date(row, "end_date", "period"); if (periodEnd) output.push({ periodEnd, announcedAt: date(row, "ann_date", "notice_date"), revenue: value(row, "revenue", "total_revenue", "operate_income"), netIncome: value(row, "netprofit", "n_income", "parent_holder_netprofit"), grossMargin: value(row, "gross_margin", "gross_profit_ratio"), netMargin: value(row, "netprofit_margin", "net_profit_ratio"), roe: value(row, "roe", "roe_waa"), debtToAssets: value(row, "debt_to_assets"), operatingCashFlow: value(row, "n_cashflow_act", "operate_cash_flow"), currency: identity.currency, source }); }
      return { evidence: source, value: output.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)) };
    }
    if (component === "valuation") { const row = data[0]; return { evidence: source, value: row ? { asOf: date(row, "trade_date", "date"), pe: value(row, "pe_ttm", "pe"), pb: value(row, "pb"), ps: value(row, "ps_ttm", "ps"), marketCap: value(row, "total_mv", "total_market_value"), currency: identity.currency, source } : undefined }; }
    return { evidence: source, value: data.map((row) => ({ date: date(row, "ann_date", "date"), title: String(row.title ?? row.name ?? "Company announcement"), ...(typeof row.url === "string" ? { url: row.url } : {}), source })).slice(0, 10) };
  }

  private async alphaComponent(component: Component, identity: StockIdentity, input: ResearchInput): Promise<{ value: any; evidence: EvidenceRef }> {
    if (!this.alpha.enabled()) throw new ProviderError({ provider: "alpha_vantage", endpoint: component, message: "ALPHAVANTAGE_API_KEY is not configured" });
    if (this.alphaCalls >= this.config.maxAlphaRequestsPerPacket) throw new ProviderError({ provider: "alpha_vantage", endpoint: component, message: "per-packet Alpha Vantage request budget exhausted" });
    const endpoint = component === "prices" ? "TIME_SERIES_DAILY" : component === "financials" ? "INCOME_STATEMENT" : component === "valuation" ? "OVERVIEW" : "NEWS_SENTIMENT";
    this.alphaCalls += 1;
    const payload = await this.fromCache(this.alpha, endpoint, component === "events" ? { tickers: identity.symbol, limit: 10 } : { symbol: identity.symbol, outputsize: "compact" }, input.refresh) as Record<string, unknown>;
    const source = endpointEvidence("alpha_vantage", endpoint, input.asOf);
    if (component === "prices") { const series = payload["Time Series (Daily)"]; const output: PriceBar[] = []; if (series && typeof series === "object") for (const [day, row] of Object.entries(series as Record<string, Row>)) { const close = value(row, "4. close"); if (close !== undefined) output.push({ date: day, close, open: value(row, "1. open"), high: value(row, "2. high"), low: value(row, "3. low"), volume: value(row, "5. volume"), source }); } return { evidence: source, value: output.sort((a, b) => b.date.localeCompare(a.date)) }; }
    if (component === "financials") { const reports = Array.isArray(payload.annualReports) ? payload.annualReports as Row[] : []; const output: FinancialPeriod[] = []; for (const row of reports) { const periodEnd = date(row, "fiscalDateEnding"); if (periodEnd) output.push({ periodEnd, revenue: value(row, "totalRevenue"), netIncome: value(row, "netIncome"), currency: typeof row.reportedCurrency === "string" ? row.reportedCurrency : identity.currency, source }); } return { evidence: source, value: output }; }
    if (component === "valuation") return { evidence: source, value: { asOf: typeof payload.LatestQuarter === "string" ? payload.LatestQuarter : undefined, pe: value(payload, "PERatio"), pb: value(payload, "PriceToBookRatio"), ps: value(payload, "PriceToSalesRatioTTM"), marketCap: value(payload, "MarketCapitalization"), currency: typeof payload.Currency === "string" ? payload.Currency : identity.currency, source } };
    const feed = Array.isArray(payload.feed) ? payload.feed as Row[] : []; return { evidence: source, value: feed.map((row) => ({ date: date(row, "time_published"), title: String(row.title ?? "Market news"), ...(typeof row.url === "string" ? { url: row.url } : {}), sentiment: value(row, "overall_sentiment_score"), source })) };
  }
}
