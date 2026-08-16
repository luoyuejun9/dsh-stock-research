import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import "@deepseek-ai/dsh-commands";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { stableStringify } from "./security.js";
import { StockResearchService } from "./service.js";
import type { Market, StockResearchConfig } from "./types.js";

export const name = "stock-research";
export const inject = ["commands", "tools"];
export const Config = z.object({
  root: z.string().default(".dsh/stock-research"),
  requestTimeoutMs: z.number().min(1_000).max(60_000).default(15_000),
  maxCacheAgeHours: z.number().min(1).max(168).default(6),
  maxAlphaRequestsPerPacket: z.number().min(1).max(20).default(5)
});

function cwdOf(agent: { session: { header: { cwd?: string } } }): string {
  if (!agent.session.header.cwd) throw new Error("this DSH session has no workspace cwd");
  return agent.session.header.cwd;
}
function words(raw: string): string[] { return [...raw.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|(\S+)/gu)].map((match) => match[1] ?? match[2] ?? match[3] ?? ""); }
function option(values: string[], flag: string): string | undefined { const index = values.indexOf(flag); return index === -1 ? undefined : values[index + 1]; }
function service(agent: { session: { header: { cwd?: string } } }, config: Partial<StockResearchConfig>): StockResearchService { return new StockResearchService(cwdOf(agent), config); }
function message(text: string) { return createUserMessage({ content: [{ type: "text", text }], source: { kind: "plugin", plugin: "dsh-stock-research" } }); }
function register(ctx: Context, definition: { name: string; description: string; parameters: Record<string, unknown>; execute(args: any, exec: any): Promise<unknown>; safe?: boolean }): void {
  ctx.tools.register(defineTool({ name: definition.name, description: definition.description, parameters: definition.parameters as any, output: { schema: { type: "json" }, render: (_args: unknown, result: unknown) => [{ type: "text", text: stableStringify(result).trimEnd() }] }, execute: definition.execute, isConcurrencySafe: () => definition.safe === true, presentCall: () => ({ card: "generic", title: definition.description, kind: "other" }) } as any));
}
function reportPrompt(symbol: string, market: string | undefined, asOf: string | undefined, compare: string | undefined): string {
  return `Prepare a Chinese end-of-day equity research report. First call stock_research_packet for ${symbol}${market ? ` with market=${market}` : ""}${asOf ? ` and as_of=${asOf}` : ""}. ${compare ? `Then call stock_compare_packets for [${symbol}, ${compare}].` : ""}
Use only returned data. Label facts versus inferences. Start with data cutoff, currency, source coverage, and gaps. Cover business/fundamentals, valuation, price trend, events, risks, and bull/base/bear cases with concrete validation points. Never issue buy/hold/sell instructions or fabricate missing data. End with the provider provenance and the research-only disclaimer.`;
}

export function apply(ctx: Context, rawConfig: Partial<StockResearchConfig> = {}): void {
  const config: Partial<StockResearchConfig> = { root: rawConfig.root ?? ".dsh/stock-research", requestTimeoutMs: rawConfig.requestTimeoutMs ?? 15_000, maxCacheAgeHours: rawConfig.maxCacheAgeHours ?? 6, maxAlphaRequestsPerPacket: rawConfig.maxAlphaRequestsPerPacket ?? 5 };
  register(ctx, { name: "stock_resolve_symbol", description: "Resolve a normalized A-share, Hong Kong, or US equity ticker without fetching market data.", parameters: { symbol: { type: "string", required: true }, market: { type: "string", enum: ["auto", "CN", "HK", "US"] } }, safe: true, execute: async (args) => (await import("./providers.js")).resolveSymbol(args.symbol, args.market ?? "auto") });
  register(ctx, { name: "stock_research_packet", description: "Fetch an evidence-backed end-of-day research packet. It never returns a trading recommendation.", parameters: { symbol: { type: "string", required: true }, market: { type: "string", enum: ["auto", "CN", "HK", "US"] }, as_of: { type: "string" }, refresh: { type: "boolean" } }, execute: async (args, exec) => { if (!exec.agent) throw new Error("stock_research_packet requires an owning agent session"); return await service(exec.agent, config).research({ symbol: args.symbol, market: args.market ?? "auto", asOf: args.as_of, refresh: args.refresh }); } });
  register(ctx, { name: "stock_compare_packets", description: "Fetch comparable end-of-day research packets for two to four securities. Monetary values remain in native currencies.", parameters: { symbols: { type: "array", required: true, items: { type: "string" } }, market: { type: "string", enum: ["auto", "CN", "HK", "US"] }, as_of: { type: "string" }, refresh: { type: "boolean" } }, execute: async (args, exec) => { if (!exec.agent) throw new Error("stock_compare_packets requires an owning agent session"); if (!Array.isArray(args.symbols) || args.symbols.length < 2 || args.symbols.length > 4) throw new Error("symbols must contain between two and four tickers"); const active = service(exec.agent, config); return await Promise.all(args.symbols.map(async (symbol: string) => await active.research({ symbol, market: args.market ?? "auto", asOf: args.as_of, refresh: args.refresh }))); } });
  register(ctx, { name: "stock_data_status", description: "Show local provider, cache, and end-of-day research status without making external requests.", parameters: {}, safe: true, execute: async (_args, exec) => { if (!exec.agent) throw new Error("stock_data_status requires an owning agent session"); return service(exec.agent, config).status(); } });

  ctx.commands.register({ name: "stock", description: "Research end-of-day A-share, Hong Kong, and US equities", input: { hint: "doctor|analyze|compare …" }, handler: async (invocation) => {
    const values = words(invocation.rawInput.trim()); const action = values.shift();
    if (!action) return { kind: "error", text: "Usage: /stock doctor|analyze <symbol> [--market cn|hk|us] [--as-of YYYY-MM-DD] [--compare ticker,ticker] [--refresh]" };
    if (action === "doctor") return { kind: "success", text: stableStringify(service(invocation.agent, config).status()).trimEnd() };
    if (action === "analyze") {
      const symbol = values[0]; if (!symbol) return { kind: "error", text: "Usage: /stock analyze <symbol> [--market cn|hk|us] [--as-of YYYY-MM-DD] [--compare ticker,ticker] [--refresh]" };
      const market = option(values, "--market"); if (market && !["cn", "hk", "us"].includes(market.toLowerCase())) return { kind: "error", text: "--market must be cn, hk, or us" };
      const asOf = option(values, "--as-of"); const compare = option(values, "--compare");
      invocation.agent.followup(message(reportPrompt(symbol, market?.toUpperCase() as Market | undefined, asOf, compare)));
      return { kind: "success", text: `Research report queued for ${symbol}.` };
    }
    if (action === "compare") {
      const symbols = values.filter((value) => !value.startsWith("--")); if (symbols.length < 2 || symbols.length > 4) return { kind: "error", text: "Usage: /stock compare <symbol> <symbol> [<symbol> <symbol>]" };
      invocation.agent.followup(message(`Prepare a Chinese evidence-backed comparison of ${symbols.join(", ")}. Call stock_compare_packets first. Compare only like-for-like percentages and multiples; keep monetary amounts in native currencies. State coverage gaps and do not issue a trading instruction.`));
      return { kind: "success", text: `Comparison report queued for ${symbols.join(", ")}.` };
    }
    return { kind: "error", text: "Usage: /stock doctor|analyze|compare" };
  } });
}
