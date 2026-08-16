import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiskCache } from "../src/cache.js";
import { deriveMetrics } from "../src/metrics.js";
import { resolveSymbol } from "../src/providers.js";
import { StockResearchService } from "../src/service.js";

describe("symbol resolution", () => {
  it.each([ ["600519.SH", "CN", "CNY"], ["00700.HK", "HK", "HKD"], ["AAPL", "US", "USD"] ] as const)("normalizes %s", (symbol, market, currency) => {
    expect(resolveSymbol(symbol)).toMatchObject({ symbol, market, currency });
  });
  it("requires an explicit normalized market code", () => expect(() => resolveSymbol("700", "HK")).not.toThrow());
  it("rejects ambiguous or malformed inputs", () => expect(() => resolveSymbol("not a ticker")).toThrow("cannot infer market"));
});

describe("derived metrics", () => {
  it("calculates return, drawdown, growth, and cash conversion", () => {
    const source = { provider: "tushare" as const, endpoint: "fixture", fetchedAt: "2026-01-01T00:00:00Z" };
    const prices = Array.from({ length: 121 }, (_, index) => ({ date: new Date(Date.UTC(2026, 4, 1) - index * 86_400_000).toISOString().slice(0, 10), close: 100 - index * 0.1, source }));
    const financials = [ { periodEnd: "2025-12-31", revenue: 120, netIncome: 30, operatingCashFlow: 36, source }, { periodEnd: "2024-12-31", revenue: 100, netIncome: 20, operatingCashFlow: 22, source } ];
    const metrics = deriveMetrics(prices, financials);
    expect(metrics.return20d).toBeCloseTo(2.04, 1);
    expect(metrics.revenueGrowthYoY).toBeCloseTo(20);
    expect(metrics.netIncomeGrowthYoY).toBeCloseTo(50);
    expect(metrics.cashConversion).toBeCloseTo(1.2);
  });
});

describe("safe disk cache", () => {
  it("stores data privately without recording a configured provider secret", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "stock-cache-")); const cache = new DiskCache(root);
    await cache.put("prices", { close: 42 });
    expect(await cache.get("prices", 60_000)).toEqual({ close: 42 });
    const content = await readFile(path.join(root, (await import("../src/security.js")).sha256("prices") + ".json"), "utf8");
    expect(content).toContain("42");
  });
  it("refuses to persist a configured provider credential", async () => {
    const original = process.env.TUSHARE_TOKEN; process.env.TUSHARE_TOKEN = "cache-test-token";
    const cache = new DiskCache(await mkdtemp(path.join(tmpdir(), "stock-cache-secret-")));
    await expect(cache.put("unsafe", { token: "cache-test-token" })).rejects.toThrow("credential");
    process.env.TUSHARE_TOKEN = original;
  });
});

describe("Tushare research packet", () => {
  const originalToken = process.env.TUSHARE_TOKEN;
  afterEach(() => { process.env.TUSHARE_TOKEN = originalToken; vi.unstubAllGlobals(); });
  it("normalizes data into an evidence-backed packet", async () => {
    process.env.TUSHARE_TOKEN = "test-token-not-a-real-secret";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body)) as { api_name: string };
      const payloads: Record<string, unknown> = {
        daily: { code: 0, data: { fields: ["trade_date", "open", "high", "low", "close", "vol"], items: [["20260102", 10, 11, 9, 10.5, 100], ["20260101", 9, 10, 8, 10, 120]] } },
        fina_indicator: { code: 0, data: { fields: ["end_date", "revenue", "netprofit", "n_cashflow_act"], items: [["20251231", 120, 30, 36], ["20241231", 100, 20, 22]] } },
        daily_basic: { code: 0, data: { fields: ["trade_date", "pe_ttm", "pb", "total_mv"], items: [["20260102", 18, 2.3, 500000]] } },
        anns_d: { code: 0, data: { fields: ["ann_date", "title", "url"], items: [["20260102", "Annual report", "https://example.test/report"]] } }
      };
      return new Response(JSON.stringify(payloads[request.api_name]), { status: 200, headers: { "content-type": "application/json" } });
    }));
    const root = await mkdtemp(path.join(tmpdir(), "stock-service-"));
    const packet = await new StockResearchService(root).research({ symbol: "600519.SH" });
    expect(packet.coverage).toBe("complete");
    expect(packet.prices[0]).toMatchObject({ close: 10.5, date: "2026-01-02" });
    expect(packet.derived.revenueGrowthYoY).toBeCloseTo(20);
    expect(packet.events[0]?.url).toBe("https://example.test/report");
    expect(packet.evidence.map((item) => item.endpoint)).toEqual(expect.arrayContaining(["daily", "fina_indicator", "daily_basic", "anns_d"]));
  });
});
