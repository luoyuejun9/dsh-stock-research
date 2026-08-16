# dsh-stock-research

[![CI](https://github.com/luoyuejun9/dsh-stock-research/actions/workflows/ci.yml/badge.svg)](https://github.com/luoyuejun9/dsh-stock-research/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Evidence-backed, end-of-day equity research for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It supports mainland China, Hong Kong, and US tickers; produces research packets for the agent; and explicitly separates source data from model inference.

中文说明见 [README.zh-CN.md](README.zh-CN.md).

> This plugin is for research and education. It is not investment advice, does not place trades, and never produces buy/hold/sell instructions.

## What it does

- Normalizes `600519.SH`, `00700.HK`, and `AAPL` into a common research packet.
- Uses Tushare as the primary data source and Alpha Vantage as a field-level REST fallback.
- Computes transparent price, growth, profitability, cash-conversion, volatility, and drawdown metrics locally.
- Emits source endpoint, fetch timestamp, market, native currency, coverage status, and missing-data reasons with every packet.
- Caches non-secret provider responses under `.dsh/stock-research/cache/`; credentials are never written to disk or logs.

## Install from GitHub

```bash
git clone https://github.com/luoyuejun9/dsh-stock-research.git
cd dsh-stock-research
npm ci
dsh plugin --profile web add .
```

The first release is pinned to DeepSeek Harness `0.1.0-rc.6` and Node.js `>=22.19`.

The project is released on GitHub; npm publication is intentionally not automated.

## Configure data sources

Set secrets in your shell or DSH runtime environment, never in a committed file:

```bash
export TUSHARE_TOKEN="your-token"
export ALPHAVANTAGE_API_KEY="your-key" # optional fallback
```

Tushare is the recommended primary source for A/HK/US coverage. Alpha Vantage is an optional fallback for supported global daily data, basic US fundamentals, and news. Its free service has a small daily allowance, so the plugin caches responses and only calls it when Tushare cannot provide a component. Review the provider terms and the entitlement of each endpoint before use.

| Source | Role | Credential | Notes |
| --- | --- | --- | --- |
| [Tushare](https://tushare.pro/document/2?doc_id=129) | Primary | `TUSHARE_TOKEN` | Coverage and permissions vary by endpoint and account points. |
| [Alpha Vantage](https://www.alphavantage.co/documentation/) | Fallback | `ALPHAVANTAGE_API_KEY` | Free access is rate-limited; do not use it as a high-frequency feed. |

Run `/stock doctor` after configuration. It reports configuration and local policy only; it does not reveal credentials or make a network request.

## Use

```text
/stock doctor
/stock analyze 600519.SH
/stock analyze 00700.HK --compare 9988.HK,JD
/stock analyze AAPL --as-of 2026-08-14
/stock compare 600519.SH 00700.HK AAPL
```

The `/stock analyze` command queues a Chinese research report. The report must show its cutoff date, native currency, coverage gaps, sources, factual data, model inferences, risks, and bull/base/bear scenarios. It may not silently invent missing financials, events, or valuation figures.

## Data and privacy model

- End-of-day research only. It makes no real-time-data claim.
- Monetary values stay in the listing currency. Cross-market comparisons use ratios and percentages; this version does not convert currencies.
- Cached data uses restrictive local permissions. Cache keys do not contain credentials.
- Provider request errors, quotas, missing entitlements, unsupported tickers, and stale cache conditions are surfaced in `gaps` rather than hidden.
- Raw provider data may be subject to provider licenses; this repository's MIT license applies only to plugin code.

## Development

```bash
npm ci
npm run check
npm run pack:check
```

Live provider checks are intentionally not part of CI. They require your own credentials and must not commit a cache or fixture containing a credential.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [docs/data-sources.md](docs/data-sources.md), and [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE) © 2026 Louis Luo
