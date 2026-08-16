# Architecture

```text
/stock command or agent tool
          |
          v
  StockResearchService
          |
          +-- Symbol resolver (CN / HK / US, native currency)
          |
          +-- Component fetcher -------------------------+
          |       prices | financials | valuation | events |
          |                          |                     |
          |                          v                     v
          |                   Tushare adapter      Alpha Vantage adapter
          |                          |                     |
          +--------------------------+---------------------+
                                     |
                                     v
                         normalized ResearchPacket
                                     |
                                     v
                 local metrics + provenance + coverage gaps
                                     |
                                     v
                        DSH agent writes research report
```

## Provider selection

The service queries Tushare first for each component. If the component is unavailable because of missing credentials, endpoint permission, an unsupported symbol, or an error, it attempts Alpha Vantage for that component only. It never describes fallback data as Tushare data, and it never fills a failed component with model-generated numbers.

## Persistence

The cache is project-local at `.dsh/stock-research/cache`. It contains only non-secret provider response JSON and a fetch time. Cache keys hash the provider, endpoint, and non-secret parameters. Credentials stay in environment variables and are not part of cache keys, packet evidence, logs, or package artifacts.

## Reliability boundaries

- Current implementation is end-of-day only.
- A packet can be `complete`, `partial`, or `unavailable`; a partial packet remains usable when its gaps are visible.
- Provider calls have a timeout and per-packet Alpha Vantage budget.
- Alpha Vantage's free quota means CI uses fixtures and must never run live provider tests.
- Metrics are deterministic local calculations. Narrative and scenarios are model inference and must be labeled as such.
