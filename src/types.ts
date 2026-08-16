export const RESEARCH_PACKET_API_VERSION = "dsh.stock-research/v1alpha1" as const;

export type Market = "CN" | "HK" | "US";
export type ProviderName = "tushare" | "alpha_vantage";
export type CoverageStatus = "complete" | "partial" | "unavailable";

export interface StockIdentity { symbol: string; displaySymbol: string; market: Market; exchange: string; name?: string | undefined; currency: string; }
export interface EvidenceRef { provider: ProviderName; endpoint: string; fetchedAt: string; asOf?: string | undefined; url?: string | undefined; note?: string | undefined; }
export interface CoverageGap { component: "identity" | "prices" | "financials" | "valuation" | "events"; reason: string; provider?: ProviderName | undefined; }
export interface PriceBar { date: string; open?: number | undefined; high?: number | undefined; low?: number | undefined; close: number; volume?: number | undefined; source: EvidenceRef; }
export interface FinancialPeriod { periodEnd: string; announcedAt?: string | undefined; revenue?: number | undefined; netIncome?: number | undefined; grossMargin?: number | undefined; netMargin?: number | undefined; roe?: number | undefined; debtToAssets?: number | undefined; operatingCashFlow?: number | undefined; currency?: string | undefined; source: EvidenceRef; }
export interface ValuationSnapshot { asOf?: string | undefined; pe?: number | undefined; pb?: number | undefined; ps?: number | undefined; marketCap?: number | undefined; currency?: string | undefined; source: EvidenceRef; }
export interface EventItem { date?: string | undefined; title: string; url?: string | undefined; sentiment?: number | undefined; source: EvidenceRef; }
export interface DerivedMetrics { return20d?: number | undefined; return60d?: number | undefined; return120d?: number | undefined; volatility60d?: number | undefined; drawdown52w?: number | undefined; revenueGrowthYoY?: number | undefined; netIncomeGrowthYoY?: number | undefined; cashConversion?: number | undefined; latestClose?: number | undefined; }
export interface ResearchPacket {
  apiVersion: typeof RESEARCH_PACKET_API_VERSION;
  generatedAt: string;
  requestedAsOf?: string | undefined;
  identity: StockIdentity;
  prices: PriceBar[];
  financials: FinancialPeriod[];
  valuation?: ValuationSnapshot;
  events: EventItem[];
  derived: DerivedMetrics;
  coverage: CoverageStatus;
  gaps: CoverageGap[];
  evidence: EvidenceRef[];
  disclaimer: string;
}
export interface ResearchInput { symbol: string; market?: "auto" | Market | undefined; asOf?: string | undefined; refresh?: boolean | undefined; }
export interface StockResearchConfig { root: string; requestTimeoutMs: number; maxCacheAgeHours: number; maxAlphaRequestsPerPacket: number; }
export interface ProviderErrorShape { provider: ProviderName; endpoint: string; message: string; status?: number; }
